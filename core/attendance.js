const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const Zkteco = require("zkteco-js");
const zk_helpers = require("./zk_helpers");
const {
  normalizeUserName: normalizeUserNameHelper,
  normalizeUserList: normalizeUserListHelper,
  extractAttendanceRecords: extractAttendanceRecordsHelper,
  getLocalDateStr: getLocalDateStrHelper,
  isRecordInDate: isRecordInDateHelper,
  filterTodayAttendance: filterTodayAttendanceHelper,
  annotateAttendanceDataWithNames: annotateAttendanceDataWithNamesHelper,
} = require("./attendance_helpers");

const ATT_TIMEOUT = 15000; // 15s timeout cho kết nối printer
const MAX_CONSECUTIVE_ERRORS = 3;
const MAX_BACKOFF_INTERVAL = 30 * 60 * 1000; // 30 minutes
const ATT_STATUS_PENDING = "pending";
const ATT_STATUS_SUCCESS = "success";
const ATT_STATUS_FAILED = "failed";

function formatDelay(delayMs) {
  if (delayMs >= 60 * 1000) {
    const minutes = Math.round(delayMs / (60 * 1000));
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }

  return `${Math.round(delayMs / 1000)}s`;
}

function normalizePollIntervalMs(value) {
  const rawMs = Number.parseInt(value, 10);
  if (!Number.isFinite(rawMs) || rawMs <= 0) return 60 * 60 * 1000;

  // Backward compatibility: values below 1 minute were saved by the old
  // seconds-based UI, for example 3000 meant "3 seconds". After the unit
  // switch, treat that as "3 minutes".
  if (rawMs < 60 * 1000) {
    const legacyMinutes = Math.round(rawMs / 1000);
    return Math.min(60, Math.max(1, legacyMinutes)) * 60 * 1000;
  }

  return rawMs;
}

class AttendanceService extends EventEmitter {
  /**
   * Khởi tạo service chấm công.
   * @param {object} config Đối tượng cấu hình (có thể có hàm get()).
   * @param {object} apiClient Client gọi API backend (nếu cần mở rộng sau này).
   */
  constructor(config, apiClient) {
    super();
    this.config = config;
    this.apiClient = apiClient;
    this.isRunning = false;
    this.pollTimer = null;
    this.consecutiveErrors = 0;
    this.stats = {
      totalAttendance: 0,
      user: 0,
      todate: null,
      previousDayAutoSync: null,
    };
    this.device = null;
    this.deviceIp = null;
    this.devicePort = null;
    this.loggedRecordKeys = new Set();
    this.attendanceFetchQueue = Promise.resolve();
    this.previousDayAutoSyncedDates = new Set();
  }

  getConfiguredDevices() {
    const cfg = this.config.get ? this.config.get() : this.config;
    const sourceDevices = Array.isArray(cfg?.devices)
      ? cfg.devices
      : cfg?.deviceIp
        ? [{ ip: cfg.deviceIp, port: cfg.devicePort, info: cfg.deviceInfo }]
        : [];

    return sourceDevices
      .map((device, index) => {
        const ip = String(device?.ip ?? device?.deviceIp ?? "").trim();
        if (!ip) return null;
        const port = Number.parseInt(device?.port ?? device?.devicePort, 10) || 4370;
        return {
          id: String(device?.id || `${ip}:${port}`).trim(),
          name: String(device?.name || `Device ${index + 1}`).trim(),
          ip,
          port,
          info: device?.info || null,
        };
      })
      .filter(Boolean);
  }

  getPrimaryDeviceConfig() {
    return this.getConfiguredDevices()[0] || null;
  }

  /**
   * Bắt đầu service polling dữ liệu chấm công.
   * @returns {{running:boolean, stats:object}} Trạng thái hiện tại của service.
   */
  start() {
    this.emit("log", {
      message: `AttendanceService start called. Running: ${this.isRunning}`,
      type: "info",
    });

    if (this.isRunning) {
      this.emit("log", {
        message: "AttendanceService already running",
        type: "warning",
      });
      return this.getStatus();
    }

    this.isRunning = true;
    this.consecutiveErrors = 0;

    this.emit("status-change", {
      ...this.getStatus(),
      message: "Attendance service started",
    });
    this.poll();

    return this.getStatus();
  }

  /**
   * Dừng service, huỷ timer polling và đóng kết nối thiết bị nếu đang mở.
   * @returns {{running:boolean, stats:object}} Trạng thái sau khi dừng.
   */
  stop() {
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.device) {
      this.safeFreeData("stop").catch(() => undefined);
      if (typeof this.device.disconnect === "function") {
        this.device.disconnect().catch(() => undefined);
      }
      this.device = null;
    }

    this.emit("status-change", {
      ...this.getStatus(),
      message: "Attendance service stopped",
    });
    this.emit("log", { message: "AttendanceService stopped", type: "info" });
    return this.getStatus();
  }

  /**
   * Vòng lặp polling chính: lấy dữ liệu, xử lý lỗi/backoff và tự lên lịch lần chạy tiếp theo.
   */
  async poll() {
    if (!this.isRunning) return;

    try {
      await this.fetchAndSavePreviousDayAttendance().catch((error) => {
        this.emit("log", {
          message: `Previous day attendance check failed: ${error.message}`,
          type: "warning",
        });
      });
      await this.fetchAndSaveTodayAttendance();
      this.consecutiveErrors = 0;
    } catch (error) {
      this.consecutiveErrors++;
      this.emit("error", { message: error.message, type: "poll" });
      this.emit("log", {
        message: `Attendance poll error (${this.consecutiveErrors}x): ${error.message}`,
        type: "failed",
      });
    }

    if (!this.isRunning) return;

    const cfg = this.config.get ? this.config.get() : this.config;
    const baseDelay = normalizePollIntervalMs(cfg.pollInterval);
    let pollDelay = baseDelay;

    if (this.consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
      pollDelay = Math.min(
        baseDelay *
          Math.pow(2, this.consecutiveErrors - MAX_CONSECUTIVE_ERRORS),
        MAX_BACKOFF_INTERVAL,
      );
      this.emit("log", {
        message: `Attendance backoff: next poll in ${formatDelay(pollDelay)}`,
        type: "warning",
      });
    }

    this.pollTimer = setTimeout(() => this.poll(), pollDelay);
  }

  /**
   * Lấy dữ liệu chấm công trong ngày hiện tại, enrich user_name, lưu file JSON và phát log.
   */
  async fetchAndSaveTodayAttendance() {
    const today = new Date();
    const dateStr = this.getLocalDateStr(today); // YYYY-MM-DD (local time)
    return this.fetchAndSaveAttendanceByDate(dateStr, {
      updateTodayStats: true,
      source: "today",
    });
  }

  async fetchAndSavePreviousDayAttendance() {
    const previousDay = new Date();
    previousDay.setDate(previousDay.getDate() - 1);
    const dateStr = this.getLocalDateStr(previousDay);

    if (this.previousDayAutoSyncedDates.has(dateStr)) {
      return this.stats.previousDayAutoSync;
    }

    const result = await this.fetchAndSaveAttendanceByDate(dateStr, {
      updateTodayStats: false,
      source: "auto-previous-day",
    });
    this.previousDayAutoSyncedDates.add(dateStr);
    return result;
  }

  async fetchAndSaveAttendanceByDate(dateStr, options = {}) {
    const task = this.attendanceFetchQueue
      .catch(() => undefined)
      .then(() => this._fetchAndSaveAttendanceByDate(dateStr, options));

    this.attendanceFetchQueue = task.catch(() => undefined);
    return task;
  }

  async readAttendanceDataFromCurrentDevice() {
    let attendanceData = null;
    if (this.device && typeof this.device.getAttendances === "function") {
      try {
        const res = await this.device.getAttendances();
        if (res) {
          attendanceData = res;
          await this.safeFreeData("attendance:getAttendances");
          this.emit("log", {
            message: "Fetched attendance via getAttendances",
            type: "success",
          });
        }
      } catch (err) {
        this.emit("log", {
          message: `getAttendances failed: ${err.message}`,
          type: "warning",
        });
      }
    } else {
      this.emit("log", {
        message: "Device does not support getAttendances",
        type: "warning",
      });
    }

    if (!attendanceData) {
      try {
        const info = await this.device.getInfo();
        attendanceData = { info };
        this.emit("log", {
          message:
            "No attendance list methods succeeded; saved device info instead",
          type: "warning",
        });
      } catch (err) {
        this.emit("log", {
          message: `Fallback getInfo failed: ${err.message}`,
          type: "warning",
        });
      }
    }

    return attendanceData;
  }

  annotateAttendanceDataWithDevice(data, deviceConfig, deviceInfo = {}) {
    const serialNumber = String(deviceInfo?.serialNumber || deviceConfig?.info?.serialNumber || "").trim();
    const deviceId = serialNumber || String(deviceConfig?.id || "").trim();

    return this.mapAttendanceRecords(data, (record) => ({
      ...record,
      sn: record?.sn || deviceId || deviceConfig?.ip || "",
      device_id: record?.device_id || deviceId || deviceConfig?.ip || "",
      device_name: record?.device_name || deviceConfig?.name || null,
      device_ip: record?.device_ip || deviceConfig?.ip || null,
      device_port: record?.device_port || deviceConfig?.port || null,
    }));
  }

  async _fetchAndSaveAttendanceByDate(dateStr, options = {}) {
    const normalizedDateStr = String(dateStr || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateStr)) {
      throw new Error("Invalid attendance date, expected YYYY-MM-DD");
    }

    const devices = this.getConfiguredDevices();
    if (devices.length === 0) {
      throw new Error("Device IP is required");
    }

    const allFetchedRecords = [];
    const deviceResults = [];
    const deviceErrors = [];

    for (const deviceConfig of devices) {
      try {
        await this.connectDevice(deviceConfig);
        this.emit("log", {
          message: `Fetching attendance data for ${normalizedDateStr} from ${deviceConfig.name} (${deviceConfig.ip}:${deviceConfig.port})`,
          type: "info",
        });

        const attendanceData = await this.readAttendanceDataFromCurrentDevice();
        const filteredData = this.filterTodayAttendance(
          attendanceData,
          normalizedDateStr,
        );
        const deviceInfo = deviceConfig.info || {};
        const deviceData = this.annotateAttendanceDataWithDevice(
          filteredData,
          deviceConfig,
          deviceInfo,
        );
        const deviceRecords = this.extractAttendanceRecords(deviceData);
        allFetchedRecords.push(...deviceRecords);
        deviceResults.push({
          id: deviceConfig.id,
          name: deviceConfig.name,
          ip: deviceConfig.ip,
          port: deviceConfig.port,
          total: deviceRecords.length,
        });
      } catch (error) {
        deviceErrors.push({
          id: deviceConfig.id,
          name: deviceConfig.name,
          ip: deviceConfig.ip,
          port: deviceConfig.port,
          error: error.message || String(error),
        });
        this.emit("log", {
          message: `Fetch attendance failed for ${deviceConfig.name} (${deviceConfig.ip}:${deviceConfig.port}): ${error.message}`,
          type: "warning",
        });
      } finally {
        try {
          if (this.device && typeof this.device.disconnect === "function") {
            await this.safeFreeData("after-fetch");
            await this.device.disconnect();
            this.device = null;
          }
        } catch (err) {
          this.emit("log", {
            message: `Disconnect error: ${err.message}`,
            type: "warning",
          });
        }
      }
    }

    if (allFetchedRecords.length === 0 && deviceErrors.length === devices.length) {
      throw new Error(
        `All attendance devices failed: ${deviceErrors.map((item) => `${item.name}: ${item.error}`).join(" | ")}`,
      );
    }

    try {
      const filteredData = this.filterTodayAttendance(
        allFetchedRecords,
        normalizedDateStr,
      );
      const todayRecords = this.extractAttendanceRecords(filteredData);
      const userMap = await this.resolveUserMap(todayRecords);
      const enrichedData = this.annotateAttendanceDataWithNames(
        filteredData,
        userMap,
      );
      const previousRecords = this.getAttendanceByDate(normalizedDateStr);
      const mergedData = this.mergeAttendanceData(
        enrichedData,
        previousRecords,
      );
      const mergedRecords = this.extractAttendanceRecords(mergedData);

      const storageDir = path.join(app.getPath("userData"), "attendance");
      if (!fs.existsSync(storageDir))
        fs.mkdirSync(storageDir, { recursive: true });

      const filePath = path.join(storageDir, `${normalizedDateStr}.json`);
      const payload = {
        fetchedAt: new Date().toISOString(),
        devices: deviceResults,
        deviceErrors,
        data: this.applyAttendanceSyncStatus(mergedData, normalizedDateStr),
      };

      if (options.syncToApi !== false) {
        await this.syncAttendancePayloadToApi(payload);
      }

      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      this.emit("log", {
        message: `Attendance data saved to ${filePath} (${mergedRecords.length} records, ${todayRecords.length} fetched)`,
        type: "success",
      });

      this.emitAttendanceActivityLogs(todayRecords, userMap);

      const syncResult = {
        date: normalizedDateStr,
        total: mergedRecords.length,
        fetchedAt: payload.fetchedAt,
        source: options.source || "manual",
        devices: deviceResults,
        deviceErrors,
      };

      if (options.updateTodayStats !== false) {
        this.stats.totalAttendance = mergedRecords.length;
        this.stats.user = userMap.size;
        this.stats.todate = normalizedDateStr;
      }

      if (syncResult.source === "auto-previous-day") {
        this.stats.previousDayAutoSync = syncResult;
      }

      this.emit("attendance-updated", syncResult);

      return syncResult;
    } finally {
      try {
        if (this.device && typeof this.device.disconnect === "function") {
          await this.safeFreeData("after-fetch");
          await this.device.disconnect();
          this.device = null;
        }
      } catch (err) {
        this.emit("log", {
          message: `Disconnect error: ${err.message}`,
          type: "warning",
        });
      }
    }
  }

  /**
   * Trả về đường dẫn file cache user (user.json) trong thư mục dữ liệu app.
   * @returns {string}
   */
  getUserCachePath() {
    return path.join(app.getPath("userData"), "attendance", "user.json");
  }

  /**
   * Đọc cache người dùng từ user.json.
   * @returns {Array<object>} Danh sách user trong cache.
   */
  loadUserCache() {
    const filePath = this.getUserCachePath();
    try {
      if (!fs.existsSync(filePath)) return [];
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : parsed?.data || [];
    } catch (error) {
      this.emit("log", {
        message: `Load user cache failed: ${error.message}`,
        type: "warning",
      });
      return [];
    }
  }

  /**
   * Ghi đè cache người dùng xuống user.json.
   * @param {Array<object>} users Danh sách user đã normalize.
   */
  saveUserCache(users) {
    const filePath = this.getUserCachePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2), "utf8");
  }

  /**
   * Đọc dữ liệu attendance theo ngày từ file cache.
   * @param {string} dateStr YYYY-MM-DD
   * @returns {Array<object>}
   */
  getAttendanceByDate(dateStr) {
    const payload = this.getAttendancePayloadByDate(dateStr);
    return this.extractAttendanceRecords(payload?.data || payload);
  }

  /**
   * Đọc payload attendance theo ngày từ file cache.
   * @param {string} dateStr YYYY-MM-DD
   * @returns {object|null}
   */
  getAttendancePayloadByDate(dateStr) {
    const filePath = path.join(
      app.getPath("userData"),
      "attendance",
      `${dateStr}.json`,
    );
    try {
      if (!fs.existsSync(filePath)) return [];
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      this.emit("log", {
        message: `Read attendance file failed: ${error.message}`,
        type: "warning",
      });
      return null;
    }
  }

  /**
   * Lấy danh sách attendance trong ngày hiện tại từ file đã lưu.
   * @returns {Array<object>}
   */
  getTodayAttendanceList() {
    const today = this.getLocalDateStr(new Date());
    return this.getAttendanceByDate(today);
  }

  /**
   * Tạo key định danh cho một log chấm công để map trạng thái gửi API.
   * @param {object} record
   * @returns {string}
   */
  buildAttendanceRecordKey(record) {
    const sn = String(record?.sn ?? "").trim();
    const userId = String(record?.user_id ?? "").trim();
    const time = String(
      record?.record_time ?? record?.timestamp ?? record?.time ?? "",
    ).trim();
    if (!sn && !userId && !time) return "";
    return `${sn}|${userId}|${time}`;
  }

  /**
   * Map qua records trong cấu trúc data array/object để áp dụng transform.
   * @param {any} data
   * @param {(record: object) => object} transform
   * @returns {any}
   */
  mapAttendanceRecords(data, transform) {
    if (Array.isArray(data)) {
      return data.map((record) =>
        record && typeof record === "object" ? transform(record) : record,
      );
    }

    if (data && typeof data === "object") {
      if (Array.isArray(data.data)) {
        return {
          ...data,
          data: data.data.map((record) =>
            record && typeof record === "object" ? transform(record) : record,
          ),
        };
      }

      if (Array.isArray(data.logs)) {
        return {
          ...data,
          logs: data.logs.map((record) =>
            record && typeof record === "object" ? transform(record) : record,
          ),
        };
      }
    }

    return data;
  }

  /**
   * Merge records from the device into the existing JSON cache.
   * Existing records that are not returned by the device are kept.
   * @param {any} data
   * @param {Array<object>} previousRecords
   * @returns {any}
   */
  mergeAttendanceData(data, previousRecords = []) {
    const incomingRecords = this.extractAttendanceRecords(data);
    const mergedRecordMap = new Map();

    const putRecord = (record, preferIncoming = false) => {
      if (!record || typeof record !== "object") return;

      const key = this.buildAttendanceRecordKey(record);
      const mapKey =
        key ||
        `fallback|${mergedRecordMap.size}|${JSON.stringify(record).slice(0, 200)}`;
      const existing = mergedRecordMap.get(mapKey);

      if (!existing) {
        mergedRecordMap.set(mapKey, record);
        return;
      }

      mergedRecordMap.set(
        mapKey,
        preferIncoming ? { ...existing, ...record } : { ...record, ...existing },
      );
    };

    for (const record of previousRecords || []) {
      putRecord(record, false);
    }

    for (const record of incomingRecords || []) {
      putRecord(record, true);
    }

    const getRecordTime = (record) =>
      new Date(
        record?.record_time ||
          record?.timestamp ||
          record?.time ||
          record?.recordTime ||
          record?.checkTime ||
          record?.punch_time ||
          record?.punchTime ||
          record?.date ||
          record?.datetime ||
          0,
      ).getTime();

    const mergedRecords = Array.from(mergedRecordMap.values()).sort((a, b) => {
      const timeA = getRecordTime(a);
      const timeB = getRecordTime(b);
      if (Number.isNaN(timeA) && Number.isNaN(timeB)) return 0;
      if (Number.isNaN(timeA)) return 1;
      if (Number.isNaN(timeB)) return -1;
      return timeA - timeB;
    });

    if (Array.isArray(data)) {
      return mergedRecords;
    }

    if (data && typeof data === "object") {
      if (Array.isArray(data.data)) {
        return { ...data, data: mergedRecords };
      }

      if (Array.isArray(data.logs)) {
        return { ...data, logs: mergedRecords };
      }
    }

    return { data: mergedRecords };
  }

  /**
   * Gắn trạng thái gửi API cho từng log: pending/success/failed.
   * @param {any} data
   * @param {string} dateStr
   * @returns {any}
   */
  applyAttendanceSyncStatus(data, dateStr) {
    const previousRecords = this.getAttendanceByDate(dateStr);
    const previousStatusMap = new Map();

    for (const record of previousRecords || []) {
      const key = this.buildAttendanceRecordKey(record);
      if (!key) continue;
      previousStatusMap.set(key, {
        status: record?.status,
        synced_at: record?.synced_at,
        sync_error: record?.sync_error,
      });
    }

    return this.mapAttendanceRecords(data, (record) => {
      const key = this.buildAttendanceRecordKey(record);
      const prev = previousStatusMap.get(key);

      if (prev && prev.status === ATT_STATUS_SUCCESS) {
        return {
          ...record,
          status: ATT_STATUS_SUCCESS,
          synced_at: prev.synced_at || record?.synced_at || null,
          sync_error: null,
        };
      }

      if (prev && prev.status === ATT_STATUS_FAILED) {
        return {
          ...record,
          status: ATT_STATUS_FAILED,
          synced_at: record?.synced_at || null,
          sync_error: prev.sync_error || record?.sync_error || null,
        };
      }

      return {
        ...record,
        status: (() => {
          const rawStatus = String(record?.status || ATT_STATUS_PENDING)
            .toLowerCase()
            .trim();
          const normalizedStatus =
            rawStatus === "pending" ? ATT_STATUS_PENDING : rawStatus;
          return [
            ATT_STATUS_PENDING,
            ATT_STATUS_SUCCESS,
            ATT_STATUS_FAILED,
          ].includes(normalizedStatus)
            ? normalizedStatus
            : ATT_STATUS_PENDING;
        })(),
        synced_at: record?.synced_at || null,
        sync_error: record?.sync_error || null,
      };
    });
  }

  /**
   * Chuyển thời gian record về format API: YYYY-MM-DD HH:mm:ss.000000
   * @param {any} value
   * @returns {string}
   */
  formatAttendanceTimestampForApi(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid record_time: ${value}`);
    }

    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000000`;
  }

  /**
   * Rút gọn thông tin lỗi từ Axios/Frappe để log ra Activity Log dễ đọc hơn.
   * @param {any} error
   * @returns {string}
   */
  getReadableSyncError(error) {
    if (!error) return "Unknown error";

    const responseData = error?.response?.data;
    if (typeof responseData?.exception === "string" && responseData.exception) {
      return responseData.exception;
    }

    if (typeof responseData?._server_messages === "string") {
      try {
        const messages = JSON.parse(responseData._server_messages);
        if (Array.isArray(messages) && messages.length > 0) {
          const firstMessage = JSON.parse(messages[0]);
          if (firstMessage?.message) {
            return String(firstMessage.message);
          }
        }
      } catch {
        // ignore parse error and continue fallback
      }
    }

    if (typeof responseData?.message === "string" && responseData.message) {
      return responseData.message;
    }

    if (typeof error?.message === "string" && error.message) {
      return error.message;
    }

    return String(error);
  }

  /**
   * Gửi các log có trạng thái pending/failed lên API và cập nhật trạng thái.
   * @param {{fetchedAt:string,device:object,data:any}} payload
   */
  async syncAttendancePayloadToApi(payload) {
    const cfg = this.config.get ? this.config.get() : this.config;
    const apiUrl = String(cfg?.apiUrl || "").trim();
    const apiKey = String(cfg?.apiKey || "").trim();
    const secretKey = String(cfg?.secretKey || "").trim();
    const defaultDeviceId =
      String(cfg?.deviceInfo?.serialNumber || "").trim() ||
      String(payload?.device?.serialNumber || "").trim();

    if (!apiUrl || !apiKey || !secretKey) {
      this.emit("log", {
        message:
          "Skip attendance sync API: missing apiUrl/apiKey/secretKey in config",
        type: "warning",
      });
      return;
    }

    let successCount = 0;
    let failedCount = 0;
    const failedMessages = [];

    payload.data = this.mapAttendanceRecords(payload.data, (record) => {
      const rawStatus = String(record?.status || ATT_STATUS_PENDING)
        .toLowerCase()
        .trim();
      const status = rawStatus === "pending" ? ATT_STATUS_PENDING : rawStatus;
      return {
        ...record,
        status: [
          ATT_STATUS_PENDING,
          ATT_STATUS_SUCCESS,
          ATT_STATUS_FAILED,
        ].includes(status)
          ? status
          : ATT_STATUS_PENDING,
      };
    });

    const records = this.extractAttendanceRecords(payload?.data);
    const shiftLocationCache = new Map();
    let allowGeolocationTracking = false;

    try {
      allowGeolocationTracking =
        await this.apiClient.isGeolocationTrackingEnabled();
    } catch (settingsError) {
      this.emit("log", {
        message: `Attendance settings lookup failed: ${settingsError.message}`,
        type: "warning",
      });
    }

    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      if (record.status === ATT_STATUS_SUCCESS) continue;

      try {
        const employeeFieldValue = String(record?.user_id || "").trim();
        if (!employeeFieldValue) {
          throw new Error("Missing user_id");
        }

        const timestamp = this.formatAttendanceTimestampForApi(
          record?.record_time || record?.timestamp || record?.time,
        );
        const deviceId =
          String(record?.device_id || record?.sn || "").trim() ||
          defaultDeviceId;

        let shiftLocation = null;
        if (allowGeolocationTracking) {
          const locationCacheKey = `${employeeFieldValue}|${timestamp.slice(0, 10)}`;
          shiftLocation = shiftLocationCache.get(locationCacheKey);

          if (shiftLocation === undefined) {
            try {
              shiftLocation =
                await this.apiClient.getShiftLocationByEmployeeFieldValue(
                  employeeFieldValue,
                  timestamp,
                );
            } catch (locationError) {
              shiftLocation = null;
              this.emit("log", {
                message: `Shift location lookup failed for employee ${employeeFieldValue}: ${locationError.message}`,
                type: "warning",
              });
            }

            shiftLocationCache.set(locationCacheKey, shiftLocation);
          }
        }

        await this.apiClient.postAttendanceLog({
          employeeFieldValue,
          timestamp,
          deviceId,
          latitude: shiftLocation?.latitude,
          longitude: shiftLocation?.longitude,
        });

        record.status = ATT_STATUS_SUCCESS;
        record.synced_at = new Date().toISOString();
        record.sync_error = null;
        successCount++;
      } catch (error) {
        record.status = ATT_STATUS_FAILED;
        record.sync_error = this.getReadableSyncError(error);
        failedMessages.push(
          `user_id=${record?.user_id || "-"}, time=${record?.record_time || record?.timestamp || record?.time || "-"}, error=${record.sync_error}`,
        );
        this.emit("log", {
          message: `Submit checkin failed: user_id=${record?.user_id || "-"}, time=${record?.record_time || record?.timestamp || record?.time || "-"}, error=${record.sync_error}`,
          type: "failed",
        });
        failedCount++;
      }
    }

    if (failedMessages.length > 0) {
      this.emit("log", {
        message: `Submit checkin failed details: ${failedMessages.join(" | ")}`,
        type: "failed",
      });
    }

    if (successCount > 0 || failedCount > 0) {
      this.emit("log", {
        message: `Attendance sync result: success=${successCount}, failed=${failedCount}`,
        type: failedCount > 0 ? "warning" : "success",
      });
    }
  }

  /**
   * Lấy danh sách user hiện tại từ cache local.
   * @returns {Array<object>}
   */
  getUsersFromCache() {
    return this.normalizeUserList(this.loadUserCache());
  }

  /**
   * Chuẩn hoá danh sách user từ thiết bị về format chung { user_id, name }.
   * @param {Array<object>} users Dữ liệu user thô từ thiết bị.
   * @returns {Array<{user_id:string,name:string}>}
   */
  normalizeUserList(users) {
    return normalizeUserListHelper(users);
  }

  /**
   * Làm sạch chuỗi tên user để hiển thị ổn định (loại ký tự control/thừa khoảng trắng).
   * @param {any} value Giá trị tên thô.
   * @returns {string}
   */
  normalizeUserName(value) {
    return normalizeUserNameHelper(value);
  }

  /**
   * Trích xuất mảng record chấm công từ nhiều cấu trúc dữ liệu khác nhau.
   * @param {any} data Dữ liệu attendance thô.
   * @returns {Array<object>}
   */
  extractAttendanceRecords(data) {
    return extractAttendanceRecordsHelper(data);
  }

  /**
   * Tạo map user_id -> name, tự sync user mới từ thiết bị nếu cache chưa có.
   * @param {Array<object>} records Danh sách record attendance đã lọc theo ngày.
   * @returns {Promise<Map<string,string>>}
   */
  async resolveUserMap(records) {
    const cacheUsers = this.normalizeUserList(this.loadUserCache());
    const userMap = new Map(cacheUsers.map((u) => [u.user_id, u.name]));

    const missingIds = new Set();
    for (const record of records || []) {
      const id = String(record?.user_id ?? "").trim();
      if (id && !userMap.has(id)) {
        missingIds.add(id);
      }
    }

    if (missingIds.size === 0) {
      return userMap;
    }

    this.emit("log", {
      message: `Missing ${missingIds.size} users in cache, syncing user data...`,
      type: "warning",
    });

    const syncedUsers = await this.syncUsers();
    const merged = this.normalizeUserList([...cacheUsers, ...syncedUsers]);
    this.saveUserCache(merged);

    const mergedMap = new Map(merged.map((u) => [u.user_id, u.name]));
    return mergedMap;
  }

  /**
   * Đồng bộ danh sách user từ thiết bị.
   * @returns {Promise<Array<{user_id:string,name:string}>>}
   */
  async syncUsers() {
    const devices = this.getConfiguredDevices();
    const allUsers = [];

    for (const deviceConfig of devices) {
      try {
        await this.connectDevice(deviceConfig);
        const fromDevice = await this.fetchUsersFromDevice();
        allUsers.push(...fromDevice);
      } catch (error) {
        this.emit("log", {
          message: `Sync users failed for ${deviceConfig.name} (${deviceConfig.ip}:${deviceConfig.port}): ${error.message}`,
          type: "warning",
        });
      } finally {
        try {
          if (this.device && typeof this.device.disconnect === "function") {
            await this.safeFreeData("sync-users");
            await this.device.disconnect();
            this.device = null;
          }
        } catch (error) {
          this.emit("log", {
            message: `Disconnect after sync users failed: ${error.message}`,
            type: "warning",
          });
        }
      }
    }

    const normalizedUsers = this.normalizeUserList(allUsers);
    if (normalizedUsers.length > 0) {
      this.saveUserCache(normalizedUsers);
      this.emit("users-updated", { total: normalizedUsers.length });
      this.emit("log", {
        message: `Synced ${normalizedUsers.length} users from ${devices.length} device(s)`,
        type: "success",
      });
      return normalizedUsers;
    }

    this.emit("log", {
      message: "Sync user from devices returned empty",
      type: "warning",
    });
    return [];
  }

  /**
   * Đồng bộ toàn bộ user từ thiết bị và ghi lại cache user.json.
   * @returns {Promise<Array<object>>}
   */
  async syncAllUsers() {
    return this.syncUsers();
  }

  /**
   * Thêm mới hoặc cập nhật user trực tiếp trên máy chấm công.
   * @param {{uid?:number,user_id?:string,name?:string,password?:string,role?:number,cardno?:number}} userData
   * @returns {Promise<object>}
   */
  async upsertUser(userData) {
    const mode = String(userData?.mode || "update").toLowerCase();
    const isCreate = mode === "create";
    const userId = String(userData?.userid ?? userData?.user_id ?? "").trim();
    const rawName = this.normalizeUserName(userData?.name || "");
    const name = this.removeVietnameseDiacritics(rawName);

    if (!userId || !name) {
      throw new Error("userid and name are required");
    }

    const password = String(userData?.password || "123");
    const role = Number.parseInt(userData?.role ?? 0, 10) || 0;
    const cardno = Number.parseInt(userData?.cardno ?? 0, 10) || 0;

    await this.connectDevice();
    try {
      if (!this.device || typeof this.device.setUser !== "function") {
        throw new Error("Device does not support setUser");
      }

      if (isCreate) {
        // Check duplicate user_id from local cache first
        const localUsers = this.getUsersFromCache();
        const existsInLocal = localUsers.some(
          (u) => String(u?.user_id ?? "").trim() === userId,
        );

        if (existsInLocal) {
          throw new Error(`User ID '${userId}' đã tồn tại`);
        }

        // Check duplicate user_id from device data
        try {
          const payload = await this.device.getUsers();
          const list = Array.isArray(payload)
            ? payload
            : payload?.data || payload?.users || [];
          const deviceUsers = this.normalizeUserList(list);
          const existsInDevice = deviceUsers.some(
            (u) => String(u?.user_id ?? "").trim() === userId,
          );
          if (existsInDevice) {
            throw new Error(`User ID '${userId}' đã tồn tại`);
          }
        } catch (error) {
          if (String(error?.message || "").includes("đã tồn tại")) {
            throw error;
          }
          this.emit("log", {
            message: `Skip duplicate check from device: ${error.message}`,
            type: "warning",
          });
        }
      }

      let desiredUid = Number.parseInt(userData?.uid, 10);
      if (!Number.isFinite(desiredUid) || desiredUid <= 0) {
        desiredUid = await this.resolveNextUid(userId);
      }

      const validationError = this.validateSetUserParams({
        uid: desiredUid,
        userid: userId,
        name,
        password,
        cardno,
      });
      if (validationError) {
        throw new Error(validationError);
      }

      await this.device.setUser(
        Number(desiredUid),
        String(userId),
        String(name),
        String(password),
        Number(role || 0),
        Number(cardno || 0),
      );

      await this.safeFreeData("set-user");

      // persist local user.json by merge/update
      const localUsers = this.getUsersFromCache();
      const filtered = localUsers.filter(
        (u) =>
          String(u?.user_id ?? "").trim() !== String(userId) &&
          Number.parseInt(u?.uid, 10) !== Number(desiredUid),
      );
      filtered.push({
        uid: Number(desiredUid),
        user_id: String(userId),
        userid: String(userId),
        name: String(name),
        role: Number(role || 0),
        cardno: Number(cardno || 0),
      });
      this.saveUserCache(this.normalizeUserList(filtered));

      const users = await this.syncUsers();
      return {
        uid: Number(desiredUid),
        user_id: userId,
        userid: userId,
        name,
        users: users.length > 0 ? users : this.getUsersFromCache(),
      };
    } finally {
      try {
        if (this.device && typeof this.device.disconnect === "function") {
          await this.device.disconnect();
          this.device = null;
        }
      } catch {
        // ignore disconnect error
      }
    }
  }

  /**
   * Xóa user trên máy chấm công theo UID.
   * @param {{uid?:number,user_id?:string}} userData
   * @returns {Promise<Array<object>>}
   */
  async deleteUser(userData) {
    const userId = String(userData?.userid ?? userData?.user_id ?? "").trim();
    const requestedUid = Number.parseInt(userData?.uid, 10);
    let uid =
      Number.isFinite(requestedUid) && requestedUid > 0 ? requestedUid : null;

    if (!Number.isFinite(uid) && userId) {
      const cachedUsers = this.getUsersFromCache();
      const existingUser = cachedUsers.find(
        (u) => String(u?.user_id ?? "").trim() === userId,
      );
      if (
        existingUser &&
        Number.isFinite(Number.parseInt(existingUser.uid, 10))
      ) {
        uid = Number.parseInt(existingUser.uid, 10);
      }
    }

    if (!Number.isFinite(uid) || uid <= 0) {
      throw new Error("uid is required for delete");
    }

    await this.connectDevice();
    try {
      if (!this.device || typeof this.device.deleteUser !== "function") {
        throw new Error("Device does not support deleteUser");
      }

      await this.device.deleteUser(uid);
      await this.safeFreeData("delete-user");

      let users = await this.syncUsers();
      if (!Array.isArray(users) || users.length === 0) {
        const localUsers = this.getUsersFromCache().filter(
          (u) => Number.parseInt(u?.uid, 10) !== Number(uid),
        );
        this.saveUserCache(localUsers);
        this.emit("users-updated", { total: localUsers.length });
        users = localUsers;
      }

      return users;
    } finally {
      try {
        if (this.device && typeof this.device.disconnect === "function") {
          await this.device.disconnect();
          this.device = null;
        }
      } catch {
        // ignore disconnect error
      }
    }
  }

  /**
   * Gọi trực tiếp getUsers() trên thiết bị để lấy danh sách user.
   * @returns {Promise<Array<{user_id:string,name:string}>>}
   */
  async fetchUsersFromDevice() {
    if (!this.device) return [];

    if (typeof this.device.getUsers !== "function") {
      this.emit("log", {
        message: "Device does not support getUsers",
        type: "warning",
      });
      return [];
    }

    try {
      const payload = await this.device.getUsers();
      console.log("Raw users from device:", payload);
      await this.safeFreeData("users:getUsers");
      const list = Array.isArray(payload)
        ? payload
        : payload?.data || payload?.users || [];
      return this.normalizeUserList(list);
    } catch (error) {
      this.emit("log", {
        message: `Fetch users from device (getUsers) failed: ${error.message}`,
        type: "warning",
      });
      return [];
    }
  }

  /**
   * Tìm UID hợp lệ cho user cần thêm/sửa.
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async resolveNextUid(userId) {
    let maxUid = 0;

    // ưu tiên UID hiện có nếu userId đã tồn tại trên máy
    try {
      const payload = await this.device.getUsers();
      const list = Array.isArray(payload)
        ? payload
        : payload?.data || payload?.users || [];
      const deviceUsers = this.normalizeUserList(list);
      const existing = deviceUsers.find(
        (u) => String(u?.user_id ?? "").trim() === String(userId),
      );
      if (existing && Number.isFinite(Number.parseInt(existing.uid, 10))) {
        return Number.parseInt(existing.uid, 10);
      }

      deviceUsers.forEach((u) => {
        const v = Number.parseInt(u?.uid, 10) || 0;
        if (v > maxUid) maxUid = v;
      });
    } catch {
      // ignore
    }

    try {
      const localUsers = this.getUsersFromCache();
      const existingLocal = localUsers.find(
        (u) => String(u?.user_id ?? "").trim() === String(userId),
      );
      if (
        existingLocal &&
        Number.isFinite(Number.parseInt(existingLocal.uid, 10))
      ) {
        return Number.parseInt(existingLocal.uid, 10);
      }

      localUsers.forEach((u) => {
        const v = Number.parseInt(u?.uid, 10) || 0;
        if (v > maxUid) maxUid = v;
      });
    } catch {
      // ignore
    }

    let desiredUid = maxUid + 1;
    if (!desiredUid || desiredUid <= 0) {
      desiredUid = Math.floor(100 + Math.random() * 2000);
    }
    if (desiredUid > 3000) desiredUid = 3000;
    if (desiredUid <= 0) desiredUid = 1;
    return desiredUid;
  }

  /**
   * Bổ sung trường user_name cho từng record attendance dựa trên userMap.
   * @param {any} data Dữ liệu attendance (array/object).
   * @param {Map<string,string>} userMap Bảng map user_id -> name.
   * @returns {any} Dữ liệu đã enrich user_name.
   */
  annotateAttendanceDataWithNames(data, userMap) {
    return annotateAttendanceDataWithNamesHelper(data, userMap);
  }

  /**
   * Phát log activity cho từng record mới (tránh log trùng bằng loggedRecordKeys).
   * @param {Array<object>} records Danh sách record đã lọc.
   * @param {Map<string,string>} userMap Bảng map user_id -> name.
   */
  emitAttendanceActivityLogs(records, userMap) {
    const formatLogTime = (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) return "-";

      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return raw;

      const pad = (num) => String(num).padStart(2, "0");
      return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    for (const record of records || []) {
      const id = String(record?.user_id ?? "").trim();
      if (!id) continue;

      const rawRecordTime =
        record?.record_time ||
        record?.timestamp ||
        record?.time ||
        record?.date ||
        "-";
      const recordTime = formatLogTime(rawRecordTime);

      const key = `${record?.sn || ""}|${id}|${rawRecordTime}`;
      if (this.loggedRecordKeys.has(key)) continue;

      this.loggedRecordKeys.add(key);
      if (this.loggedRecordKeys.size > 5000) {
        this.loggedRecordKeys.clear();
      }

      const userName = userMap.get(id) || "Unknown";
      this.emit("log", {
        message: `Attendance: user_id=${id}, name=${userName}, time=${recordTime}`,
        type: "info",
      });
    }
  }

  /**
   * Lọc dữ liệu attendance theo ngày hiện tại.
   * @param {any} rawData Dữ liệu attendance thô.
   * @param {string} dateStr Ngày mục tiêu định dạng YYYY-MM-DD.
   * @returns {any} Dữ liệu đã lọc theo ngày.
   */
  filterTodayAttendance(rawData, dateStr) {
    return filterTodayAttendanceHelper(rawData, dateStr);
  }

  /**
   * Kiểm tra một record có thuộc ngày cần lọc hay không.
   * @param {object} record Record attendance.
   * @param {string} dateStr Ngày mục tiêu định dạng YYYY-MM-DD.
   * @returns {boolean}
   */
  isRecordInDate(record, dateStr) {
    return isRecordInDateHelper(record, dateStr);
  }

  /**
   * Chuyển Date sang chuỗi ngày local định dạng YYYY-MM-DD.
   * @param {Date|string|number} date
   * @returns {string}
   */
  getLocalDateStr(date) {
    return getLocalDateStrHelper(date);
  }

  /**
   * Lấy trạng thái runtime của service.
   * @returns {{running:boolean, stats:object}}
   */
  getStatus() {
    return {
      running: this.isRunning,
      stats: { ...this.stats },
    };
  }

  /**
   * Loại bỏ dấu tiếng Việt để phù hợp giới hạn charset trên một số máy chấm công.
   * @param {string} value
   * @returns {string}
   */
  removeVietnameseDiacritics(value) {
    let str = String(value || "").trim();
    str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    str = str.replace(/đ/g, "d").replace(/Đ/g, "D");
    return str;
  }

  /**
   * Kết nối tới máy chấm công theo cấu hình hiện tại.
   * Tự tái sử dụng socket nếu còn sống và tự reconnect khi cần.
   * @returns {Promise<{ip:string, port:number}>}
   */
  async connectDevice(deviceConfig = null) {
    const cfg = this.config.get ? this.config.get() : this.config;
    const selectedDevice = deviceConfig || this.getPrimaryDeviceConfig();
    const ip = String(selectedDevice?.ip || cfg.deviceIp || "").trim();
    const portValue = String(selectedDevice?.port || cfg.devicePort || "").trim();
    const port = Number.parseInt(portValue, 10) || 4370;

    if (!ip) {
      const msg = "Device IP is required";
      this.emit("log", { message: msg, type: "failed" });
      throw new Error(msg);
    }

    if (this.device && (this.deviceIp !== ip || this.devicePort !== port)) {
      try {
        await this.device.disconnect();
      } catch (error) {
        this.emit("log", {
          message: `Disconnect old device failed: ${error.message}`,
          type: "warning",
        });
      }
      this.device = null;
    }

    if (!this.device) {
      this.device = new Zkteco(ip, port, ATT_TIMEOUT, 5000);
      this.deviceIp = ip;
      this.devicePort = port;
    }

    const connected = await this.isSocketAlive();
    if (connected) {
      this.emit("log", {
        message: `Reusing existing device socket ${ip}:${port}`,
        type: "info",
      });
      return { ip, port };
    }

    this.emit("log", {
      message: `Connecting to device ${ip}:${port}...`,
      type: "info",
    });

    try {
      await Promise.race([
        this.device.createSocket(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${ATT_TIMEOUT / 1000}s`)),
            ATT_TIMEOUT,
          ),
        ),
      ]);

      this.emit("log", { message: "Device connected", type: "success" });
      return { ip, port };
    } catch (error) {
      this.emit("log", {
        message: `Connect failed: ${error.message}`,
        type: "failed",
      });
      this.emit("error", { message: error.message, type: "connect" });
      throw error;
    }
  }

  /**
   * Kiểm tra socket thiết bị còn hoạt động hay không.
   * @returns {Promise<boolean>}
   */
  async isSocketAlive() {
    if (!this.device) return false;
    if (typeof this.device.getSocketStatus === "function") {
      try {
        const status = await this.device.getSocketStatus();
        return !!status;
      } catch {
        return false;
      }
    }

    const type = this.device.connectionType;
    if (type === "tcp") return !!this.device?.ztcp?.socket;
    if (type === "udp") return !!this.device?.zudp?.socket;
    return false;
  }

  /**
   * Gọi freeData an toàn để dọn buffer trên thiết bị, tránh throw làm gãy luồng chính.
   * @param {string} context Ngữ cảnh để log debug.
   */
  async safeFreeData(context = "") {
    if (!this.device || typeof this.device.freeData !== "function") return;
    try {
      await this.device.freeData();
    } catch (error) {
      this.emit("log", {
        message: `freeData${context ? ` (${context})` : ""} failed: ${error.message}`,
        type: "warning",
      });
    }
  }

  /**
   * Lấy thông tin thiết bị cơ bản (name/serial/info) để hiển thị trên UI.
   * @returns {Promise<{ip:string,port:number,name:string|null,serialNumber:string|null,info:any}>}
   */
  async getDeviceInfo(deviceConfig = null) {
    await this.connectDevice(deviceConfig);
    // Call each info method separately so a failure in one doesn't break the others
    const payload = {
      ip: this.deviceIp,
      port: this.devicePort,
      id: deviceConfig?.id || `${this.deviceIp}:${this.devicePort}`,
      name: null,
      serialNumber: null,
      info: null,
    };

    const errors = [];

    try {
      // payload.serialNumber = await this.device.getSerialNumber();
      payload.serialNumber = await zk_helpers.getSerialNumberSafe(this.device);
      payload.name = await this.device.getDeviceName();
      payload.info = await this.device.getInfo();

      await this.device.disconnect();
      this.device = null;
    } catch (e) {
      errors.push({ method: "getSerialNumber", message: e.message });
      this.emit("log", {
        message: `getSerialNumber failed: ${e.message}`,
        type: "warning",
      });
    }

    if (errors.length === 1) {
      const err = new Error(
        "All device info calls failed: " + JSON.stringify(errors),
      );
      this.emit("log", {
        message: `Get device info failed: ${err.message}`,
        type: "failed",
      });
      this.emit("error", { message: err.message, type: "device-info" });
      throw err;
    }

    this.emit("log", {
      message: "Device info loaded (partial)",
      type: "success",
    });
    return payload;
  }

  /**
   * Validate dữ liệu đầu vào theo giới hạn setUser của zkteco-js.
   * Rule gốc:
   * - uid: 1..3000
   * - userid: tối đa 9 ký tự
   * - name: tối đa 24 ký tự
   * - password: tối đa 8 ký tự
   * - cardno: tối đa 10 chữ số
   * @param {{uid:number,userid:string,name:string,password:string,cardno:number|string}} params
   * @returns {string|null} Thông báo lỗi nếu không hợp lệ, ngược lại trả về null.
   */
  validateSetUserParams(params) {
    const uid = Number.parseInt(params?.uid, 10);
    const userid = String(params?.userid ?? "");
    const name = String(params?.name ?? "");
    const password = String(params?.password ?? "");
    const cardnoStr = String(params?.cardno ?? "0");

    if (!Number.isFinite(uid) || uid <= 0 || uid > 3000) {
      return "UID không hợp lệ (chỉ chấp nhận từ 1 đến 3000)";
    }
    if (userid.length > 9) {
      return "User ID không hợp lệ (tối đa 9 ký tự)";
    }
    if (name.length > 24) {
      return "Tên không hợp lệ (tối đa 24 ký tự)";
    }
    if (password.length > 8) {
      return "Password không hợp lệ (tối đa 8 ký tự)";
    }
    if (cardnoStr.length > 10) {
      return "CardNo không hợp lệ (tối đa 10 ký tự số)";
    }

    return null;
  }
}

module.exports = { AttendanceService };
