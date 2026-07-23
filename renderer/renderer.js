const apiUrlInput = document.getElementById("apiUrl");
const secretKeyInput = document.getElementById("secretKey");
const apiKeyInput = document.getElementById("apiKey");
const deviceIpInput = document.getElementById("deviceIp");
const devicePortInput = document.getElementById("devicePort");
const extraDevicesInput = document.getElementById("extraDevices");
const extraDeviceNameInput = document.getElementById("extraDeviceName");
const extraDeviceIpInput = document.getElementById("extraDeviceIp");
const extraDevicePortInput = document.getElementById("extraDevicePort");
const addDeviceBtn = document.getElementById("addDeviceBtn");
const extraDeviceListEl = document.getElementById("extraDeviceList");
const deviceInfoEl = document.getElementById("deviceInfo");
const deviceCard = document.getElementById("deviceCard");
const deviceNameEl = document.getElementById("deviceName");
const deviceSerialEl = document.getElementById("deviceSerial");
const deviceInfoFullEl = document.getElementById("deviceInfoFull");
const pollIntervalInput = document.getElementById("pollInterval");
const pollIntervalValue = document.getElementById("pollIntervalValue");
const autoStartCheckbox = document.getElementById("autoStart");
const saveConfigBtn = document.getElementById("saveConfig");
const testConnectionBtn = document.getElementById("testConnection");
const testDeviceBtn = document.getElementById("testDevice");
const startServiceBtn = document.getElementById("startService");
const stopServiceBtn = document.getElementById("stopService");
const statusIndicator = document.getElementById("statusIndicator");
const statusText = document.getElementById("statusText");
const statusMeta = document.getElementById("statusMeta");
const totalAttendanceEl = document.getElementById("totalAttendance");
const totalUsersEl = document.getElementById("totalUsers");
const todayRealtimeEl = document.getElementById("todayRealtime");
const cardTotalAttendance = document.getElementById("cardTotalAttendance");
const cardUsers = document.getElementById("cardUsers");
const logContainer = document.getElementById("logContainer");
const logFiltersEl = document.getElementById("logFilters");
const clearLogViewBtn = document.getElementById("clearLogView");
const logCountBadge = document.getElementById("logCountBadge");
const lastSyncBadge = document.getElementById("lastSyncBadge");
const issueBannerTitle = document.getElementById("issueBannerTitle");
const issueBannerMessage = document.getElementById("issueBannerMessage");
const deviceHealthValue = document.getElementById("deviceHealthValue");
const apiHealthValue = document.getElementById("apiHealthValue");
const syncHealthValue = document.getElementById("syncHealthValue");
const previousDaySyncValue = document.getElementById("previousDaySyncValue");
const updateHealthValue = document.getElementById("updateHealthValue");
const openAttendanceAction = document.getElementById("openAttendanceAction");
const openUsersAction = document.getElementById("openUsersAction");
const deviceSectionBadge = document.getElementById("deviceSectionBadge");
const apiSectionBadge = document.getElementById("apiSectionBadge");
const syncSectionBadge = document.getElementById("syncSectionBadge");

let currentConfig = {};
let currentServiceRunning = false;
let activeLogFilter = "all";
let logEntries = [];
let latestIssue = null;
let latestSyncAt = null;
const deviceConnectionResults = new Map();
const ONE_MINUTE_MS = 60 * 1000;

const healthState = {
  device: {
    value: "Chưa kiểm tra",
    meta: "Chưa có thông tin kết nối thiết bị",
    tone: "default",
  },
  api: {
    value: "Chưa kiểm tra",
    meta: "Hãy dùng nút kiểm tra API để xác nhận",
    tone: "default",
  },
  sync: {
    success: 0,
    failed: 0,
    pending: 0,
    meta: "Tính theo trạng thái bản ghi checkin đã lưu",
  },
  previousDay: {
    date: null,
    total: 0,
    fetchedAt: null,
    tone: "default",
  },
  update: {
    value: "Chưa kiểm tra",
    meta: "Chưa có thông tin cập nhật",
    tone: "default",
  },
};

function ensureDataDialog() {
  let overlay = document.getElementById("dataDialogOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "dataDialogOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.35)";
  overlay.style.display = "none";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "10000";

  const modal = document.createElement("div");
  modal.style.width = "min(960px, 92vw)";
  modal.style.maxHeight = "86vh";
  modal.style.background = "#fff";
  modal.style.borderRadius = "16px";
  modal.style.border = "1px solid #e5e7eb";
  modal.style.display = "flex";
  modal.style.flexDirection = "column";
  modal.style.boxShadow = "0 20px 40px rgba(15,23,42,0.18)";

  const header = document.createElement("div");
  header.id = "dataDialogHeader";
  header.style.padding = "14px 16px";
  header.style.borderBottom = "1px solid #e5e7eb";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const title = document.createElement("div");
  title.id = "dataDialogTitle";
  title.style.fontWeight = "700";

  const close = document.createElement("button");
  close.className = "btn btn-secondary";
  close.textContent = "Đóng";
  close.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  header.appendChild(title);
  header.appendChild(close);

  const body = document.createElement("div");
  body.id = "dataDialogBody";
  body.style.padding = "14px 16px";
  body.style.overflow = "auto";

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  return overlay;
}

function openDataDialog(title, contentHtml) {
  const overlay = ensureDataDialog();
  const titleEl = document.getElementById("dataDialogTitle");
  const bodyEl = document.getElementById("dataDialogBody");
  titleEl.textContent = title;
  bodyEl.innerHTML = contentHtml;
  overlay.style.display = "flex";
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAttendanceTime(value) {
  const pad = (num) => String(num).padStart(2, "0");
  if (value === null || value === undefined || value === "") return "-";

  const raw = String(value).trim();
  if (!raw) return "-";

  const parsedDate = new Date(raw);
  if (!Number.isNaN(parsedDate.getTime())) {
    return `${pad(parsedDate.getDate())}-${pad(parsedDate.getMonth() + 1)}-${parsedDate.getFullYear()} ${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}:${pad(parsedDate.getSeconds())}`;
  }

  const match = raw.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (match) {
    const [, yyyy, mm, dd, hh = "00", min = "00", ss = "00"] = match;
    return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
  }

  return raw;
}

function formatClockTime(value = new Date()) {
  return new Date(value).toLocaleTimeString("vi-VN");
}

function formatDateInputValue(value = new Date()) {
  const date = new Date(value);
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizePollIntervalMinutes(value) {
  const rawMs = Number.parseInt(value, 10);
  if (!Number.isFinite(rawMs) || rawMs <= 0) return 60;

  // Backward compatibility: old configs stored seconds as milliseconds
  // from the range value, for example 3000 meant "3s". Treat that as
  // "3 minutes" after the UI unit switch.
  if (rawMs < ONE_MINUTE_MS) {
    return Math.min(60, Math.max(1, Math.round(rawMs / 1000)));
  }

  return Math.min(60, Math.max(1, Math.round(rawMs / ONE_MINUTE_MS)));
}

function formatPollIntervalMinutes(value) {
  const minutes = Number.parseInt(value, 10) || 60;
  return `${minutes} phút`;
}

function normalizeDeviceEntry(device, index = 0) {
  const ip = String(device?.ip ?? device?.deviceIp ?? "").trim();
  if (!ip) return null;
  const port = String(device?.port ?? device?.devicePort ?? "4370").trim() || "4370";
  const name = String(device?.name || `Máy chấm công ${index + 1}`).trim();
  return {
    id: String(device?.id || `${ip}:${port}`).trim(),
    name,
    ip,
    port,
    info: device?.info || null,
  };
}

function getDeviceKey(device) {
  const ip = String(device?.ip ?? device?.deviceIp ?? "").trim();
  const port = String(device?.port ?? device?.devicePort ?? "4370").trim() || "4370";
  return ip ? `${ip}:${port}` : "";
}

function parseDeviceInfoPayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getDeviceResult(device) {
  return deviceConnectionResults.get(getDeviceKey(device)) || null;
}

function setDeviceResult(device, result) {
  const key = getDeviceKey(device);
  if (!key) return;
  deviceConnectionResults.set(key, {
    ...result,
    device: result?.device || device,
    checkedAt: new Date().toISOString(),
  });
}

function formatDeviceStatusLabel(device) {
  const result = getDeviceResult(device);
  if (result) {
    return result.success ? "Kết nối tốt" : "Kết nối lỗi";
  }
  return device?.info ? "Đã có thông tin" : "Chưa kiểm tra";
}

function getDeviceStatusClass(device) {
  const result = getDeviceResult(device);
  if (result) return result.success ? "device-status-success" : "device-status-failed";
  return device?.info ? "device-status-success" : "device-status-pending";
}

function getDeviceInfoRows(device) {
  const result = getDeviceResult(device);
  const info = result?.info || device?.info || {};
  const nestedInfo = parseDeviceInfoPayload(info.info);
  const userCounts =
    extractUserCounts(info.info) ??
    extractUserCounts(info) ??
    extractUserCounts(nestedInfo) ??
    null;
  const rowCandidates = [
    ["IP/Port", `${device.ip}:${device.port || "4370"}`],
    ["Tên máy", device.name || info.name || "-"],
    ["Device name", info.name || nestedInfo.name || "-"],
    ["Serial", info.serialNumber || info.serial || nestedInfo.serialNumber || nestedInfo.serial || "-"],
    ["Version", info.version || nestedInfo.version || nestedInfo.firmwareVersion || "-"],
    ["MAC", info.mac || nestedInfo.mac || nestedInfo.MAC || "-"],
    ["User count", userCounts ?? "-"],
  ];

  if (result && !result.success) {
    rowCandidates.push(["Lỗi", result.error || "Không kết nối được thiết bị"]);
  }

  return rowCandidates;
}

function formatDeviceDetailsHeader(devices = []) {
  const successCount = devices.filter((device) => {
    const result = getDeviceResult(device);
    return result ? result.success : !!device.info;
  }).length;
  const failedCount = devices.filter((device) => getDeviceResult(device)?.success === false).length;
  const pendingCount = Math.max(0, devices.length - successCount - failedCount);

  if (successCount === 0 && failedCount === 0) {
    return `${devices.length} máy chấm công`;
  }

  return `${successCount}/${devices.length} máy kết nối thành công${failedCount ? `, ${failedCount} lỗi` : ""}${pendingCount ? `, ${pendingCount} chưa kiểm tra` : ""}`;
}

function renderDeviceDetails(devices = []) {
  if (!deviceCard) return;
  const normalizedDevices = (Array.isArray(devices) ? devices : [])
    .map((device, index) => normalizeDeviceEntry(device, index))
    .filter(Boolean);

  if (normalizedDevices.length === 0) {
    deviceCard.style.display = "none";
    return;
  }

  deviceCard.style.display = "block";
  deviceCard.innerHTML = `
    <div class="device-card-header">
      <strong>${escapeHtml(formatDeviceDetailsHeader(normalizedDevices))}</strong>
      <span>${escapeHtml(String(normalizedDevices.length))} máy</span>
    </div>
    <div class="device-detail-list">
      ${normalizedDevices
        .map((device, index) => {
          const rows = getDeviceInfoRows(device);
          return `
            <div class="device-detail-item">
              <div class="device-detail-heading">
                <div>
                  <strong>${escapeHtml(device.name || `Máy ${index + 1}`)}</strong>
                  <span>${escapeHtml(device.ip)}:${escapeHtml(device.port || "4370")}</span>
                </div>
                <span class="device-status-chip ${getDeviceStatusClass(device)}">${escapeHtml(formatDeviceStatusLabel(device))}</span>
              </div>
              <div class="device-detail-grid">
                ${rows
                  .map(
                    ([label, value]) => `
                      <span>${escapeHtml(label)}</span>
                      <strong>${escapeHtml(value ?? "-")}</strong>
                    `,
                  )
                  .join("")}
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function serializeExtraDevices(devices = []) {
  return devices
    .map((device) => `${device.name || ""} | ${device.ip} | ${device.port || "4370"}`)
    .join("\n");
}

function getExtraDevicesFromStorage() {
  return String(extraDevicesInput?.value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
      const name = parts.length >= 3 ? parts[0] : `Máy chấm công ${index + 2}`;
      const ip = parts.length >= 3 ? parts[1] : parts[0];
      const port = parts.length >= 3 ? parts[2] : parts[1] || "4370";
      return normalizeDeviceEntry({ name, ip, port }, index + 1);
    })
    .filter(Boolean);
}

function renderExtraDeviceList() {
  if (!extraDeviceListEl) return;
  const devices = getExtraDevicesFromStorage();

  if (devices.length === 0) {
    extraDeviceListEl.className = "device-list-empty";
    extraDeviceListEl.textContent = "Chưa thêm máy bổ sung";
    return;
  }

  extraDeviceListEl.className = "device-list";
  extraDeviceListEl.innerHTML = devices
    .map(
      (device, index) => `
        <div class="device-list-item">
          <div class="device-list-main">
            <strong>${escapeHtml(device.name)}</strong>
            <span>${escapeHtml(device.ip)}:${escapeHtml(device.port)}</span>
          </div>
          <span class="device-status-chip ${getDeviceStatusClass(device)}">${escapeHtml(formatDeviceStatusLabel(device))}</span>
          <div class="device-list-actions">
            <button class="btn btn-secondary btn-compact btn-test-device" type="button" data-index="${index}">Test</button>
            <button class="btn btn-secondary btn-compact btn-remove-device" type="button" data-index="${index}">Xóa</button>
          </div>
        </div>
      `,
    )
    .join("");

  extraDeviceListEl.querySelectorAll(".btn-test-device").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number.parseInt(button.getAttribute("data-index"), 10);
      const device = getExtraDevicesFromStorage()[index];
      if (!device) return;

      button.disabled = true;
      button.textContent = "Đang test...";
      try {
        await testConfiguredDevices([device], { silentSuccess: false });
      } finally {
        button.disabled = false;
        button.textContent = "Test";
      }
    });
  });

  extraDeviceListEl.querySelectorAll(".btn-remove-device").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number.parseInt(button.getAttribute("data-index"), 10);
      const nextDevices = getExtraDevicesFromStorage().filter(
        (_, itemIndex) => itemIndex !== index,
      );
      extraDevicesInput.value = serializeExtraDevices(nextDevices);
      renderExtraDeviceList();
      renderDeviceDetails(getDevicesFromInputs());
      updateSectionBadges();
    });
  });
}

function getDevicesFromInputs() {
  const devices = [];
  const primaryIp = String(deviceIpInput.value || "").trim();
  const primaryPort = String(devicePortInput.value || "4370").trim() || "4370";
  if (primaryIp) {
    devices.push({
      id: `${primaryIp}:${primaryPort}`,
      name: "Máy chính",
      ip: primaryIp,
      port: primaryPort,
    });
  }

  devices.push(...getExtraDevicesFromStorage());

  const uniqueDevices = new Map();
  devices.forEach((device, index) => {
    const normalized = normalizeDeviceEntry(device, index);
    if (normalized) {
      const knownResult = getDeviceResult(normalized);
      if (!normalized.info && knownResult?.success && knownResult.info) {
        normalized.info = knownResult.info;
      }
      uniqueDevices.set(`${normalized.ip}:${normalized.port}`, normalized);
    }
  });

  return Array.from(uniqueDevices.values());
}

function renderDevicesToInputs(devices = []) {
  const normalizedDevices = (Array.isArray(devices) ? devices : [])
    .map((device, index) => normalizeDeviceEntry(device, index))
    .filter(Boolean);
  const primaryDevice = normalizedDevices[0] || null;

  deviceIpInput.value = primaryDevice?.ip || "";
  devicePortInput.value = primaryDevice?.port || "";

  if (extraDevicesInput) {
    extraDevicesInput.value = serializeExtraDevices(normalizedDevices.slice(1));
    renderExtraDeviceList();
  }
  renderDeviceDetails(normalizedDevices);
}

function formatDeviceInfoSummary(results = []) {
  const successCount = results.filter((result) => result.success).length;
  const failedCount = results.length - successCount;
  return `${successCount}/${results.length} máy kết nối thành công${failedCount ? `, ${failedCount} lỗi` : ""}`;
}

function classifyLogEntry(message, type) {
  const text = String(message || "").toLowerCase();
  if (
    text.includes("submit checkin") ||
    text.includes("attendance sync") ||
    text.includes("sync result") ||
    text.includes("fetching attendance") ||
    text.includes("fetched attendance")
  ) {
    return "sync";
  }

  if (
    text.includes("device") ||
    text.includes("socket") ||
    text.includes("connecting") ||
    text.includes("disconnect")
  ) {
    return "device";
  }

  if (type === "failed") return "sync";
  return "general";
}

function addLog(message, type = "default", timestamp = new Date()) {
  const normalizedType = ["default", "info", "success", "warning", "failed"].includes(type)
    ? type
    : "default";

  logEntries.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message: String(message || ""),
    type: normalizedType,
    category: classifyLogEntry(message, normalizedType),
    timestamp: new Date(timestamp),
  });

  if (logEntries.length > 200) {
    logEntries = logEntries.slice(-200);
  }

  syncHealthWithLog(message, normalizedType);
  renderLogs();
  updateOverview();
}

function syncHealthWithLog(message, type) {
  const text = String(message || "");
  const lowerText = text.toLowerCase();

  if (lowerText.includes("device connected")) {
    healthState.device.value = "Đã kết nối";
    healthState.device.meta = "Thiết bị đã phản hồi và sẵn sàng đọc dữ liệu";
    healthState.device.tone = "success";
  } else if (
    lowerText.includes("connect failed") ||
    lowerText.includes("device connection failed") ||
    lowerText.includes("device info fetch failed") ||
    lowerText.includes("device connection error")
  ) {
    healthState.device.value = "Kết nối lỗi";
    healthState.device.meta = text;
    healthState.device.tone = "failed";
  }

  if (lowerText.includes("api connection test successful")) {
    healthState.api.value = "Kết nối tốt";
    healthState.api.meta = "API đã phản hồi thành công với thông tin xác thực hiện tại";
    healthState.api.tone = "success";
  } else if (
    lowerText.includes("connection test failed") ||
    lowerText.includes("không kết nối được api") ||
    lowerText.includes("api")
  ) {
    if (
      lowerText.includes("connection test failed") ||
      lowerText.includes("api") && type === "failed"
    ) {
      healthState.api.value = "Có lỗi";
      healthState.api.meta = text;
      healthState.api.tone = "failed";
    }
  }

  if (
    type === "failed" ||
    lowerText.includes("submit checkin failed") ||
    lowerText.includes("attendance error")
  ) {
    latestIssue = {
      text: text.length > 140 ? `${text.slice(0, 137)}...` : text,
      meta: `Ghi nhận lúc ${formatClockTime()}`,
      message: text,
      type: "failed",
    };
  } else if (
    type === "warning" &&
    (!latestIssue || latestIssue.type !== "failed")
  ) {
    latestIssue = {
      text: text.length > 140 ? `${text.slice(0, 137)}...` : text,
      meta: `Cảnh báo lúc ${formatClockTime()}`,
      message: text,
      type: "warning",
    };
  }

  if (lowerText.includes("attendance sync result")) {
    latestSyncAt = new Date();
  }
}

function renderLogs() {
  const entries = logEntries.filter((entry) => {
    if (activeLogFilter === "all") return true;
    if (activeLogFilter === "failed") return entry.type === "failed";
    if (activeLogFilter === "warning") return entry.type === "warning";
    if (activeLogFilter === "sync") return entry.category === "sync";
    if (activeLogFilter === "device") return entry.category === "device";
    return true;
  });

  logCountBadge.textContent = `${entries.length} log`;

  if (entries.length === 0) {
    logContainer.innerHTML =
      '<div class="log-empty">Không có log phù hợp với bộ lọc hiện tại.</div>';
    return;
  }

  logContainer.innerHTML = entries
    .map((entry) => {
      const badgeClass = `log-badge-${entry.type}`;
      const badgeText = (() => {
        if (entry.type === "failed") return "Lỗi";
        if (entry.type === "warning") return "Cảnh báo";
        if (entry.type === "success") return "Thành công";
        if (entry.type === "info") return "Thông tin";
        return "Hoạt động";
      })();

      const categoryText = (() => {
        if (entry.category === "device") return "Thiết bị";
        if (entry.category === "sync") return "Đồng bộ";
        return "Hệ thống";
      })();

      return `
        <article class="log-entry log-${entry.type}">
          <span class="log-time">${escapeHtml(formatClockTime(entry.timestamp))}</span>
          <div class="log-body">
            <div class="log-meta">
              <span class="log-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
              <span class="meta-pill">${escapeHtml(categoryText)}</span>
            </div>
            <div class="log-message">${escapeHtml(entry.message)}</div>
          </div>
        </article>
      `;
    })
    .join("");

  logContainer.scrollTop = logContainer.scrollHeight;
}

function applyPreviousDaySyncPayload(payload) {
  if (!payload || payload.source !== "auto-previous-day") return;

  healthState.previousDay = {
    date: payload.date || null,
    total: Number.parseInt(payload.total, 10) || 0,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    tone: "success",
  };
}

function applyUpdateStatusPayload(payload = {}) {
  const state = String(payload.state || "idle").toLowerCase();
  const percent =
    payload.percent !== null && payload.percent !== undefined
      ? Number.parseInt(payload.percent, 10)
      : null;
  const versionText = payload.version ? ` ${payload.version}` : "";
  const stateMap = {
    checking: { value: "Đang kiểm tra", tone: "warning" },
    available: { value: `Có bản mới${versionText}`, tone: "warning" },
    downloading: {
      value: `Đang tải${Number.isFinite(percent) ? ` ${percent}%` : ""}`,
      tone: "warning",
    },
    downloaded: { value: `Sẵn sàng cài${versionText}`, tone: "success" },
    current: { value: "Mới nhất", tone: "success" },
    disabled: { value: "Chưa cấu hình", tone: "default" },
    error: { value: "Lỗi kiểm tra", tone: "failed" },
  };
  const mapped = stateMap[state] || {
    value: payload.message || "Chưa kiểm tra",
    tone: "default",
  };

  healthState.update.value = mapped.value;
  healthState.update.meta = payload.message || mapped.value;
  healthState.update.tone = mapped.tone;
  updateOverview();
}

function formatPreviousDaySyncStatus() {
  const syncInfo = healthState.previousDay;
  if (!syncInfo?.fetchedAt) {
    return "Ngày trước: Chưa tự đẩy";
  }

  const dateText = syncInfo.date || "ngày trước";
  const total = Number.parseInt(syncInfo.total, 10) || 0;
  return `Ngày trước: Đã tự đẩy ${dateText} (${total} bản ghi) lúc ${formatClockTime(syncInfo.fetchedAt)}`;
}

function updateOverview() {
  deviceHealthValue.textContent = `Thiết bị: ${healthState.device.value}`;
  apiHealthValue.textContent = `HR API: ${healthState.api.value}`;
  syncHealthValue.textContent = `Đồng bộ: ${healthState.sync.success} thành công / ${healthState.sync.failed} lỗi`;
  const previousDayStatusText = formatPreviousDaySyncStatus();
  previousDaySyncValue.textContent = previousDayStatusText;
  previousDaySyncValue.title = previousDayStatusText;
  if (updateHealthValue) {
    updateHealthValue.textContent = `Cập nhật: ${healthState.update.value}`;
    updateHealthValue.title = healthState.update.meta;
  }

  const applyPillTone = (element, tone) => {
    if (!element) return;
    element.classList.remove(
      "hero-status-pill-success",
      "hero-status-pill-warning",
      "hero-status-pill-failed",
      "hero-status-pill-default",
    );
    element.classList.add(`hero-status-pill-${tone || "default"}`);
  };

  applyPillTone(deviceHealthValue, healthState.device.tone);
  applyPillTone(apiHealthValue, healthState.api.tone);
  applyPillTone(
    syncHealthValue,
    healthState.sync.failed > 0
      ? "failed"
      : healthState.sync.success > 0
        ? "success"
        : "default",
  );
  applyPillTone(previousDaySyncValue, healthState.previousDay.tone);
  applyPillTone(updateHealthValue, healthState.update.tone);
  issueBannerTitle.textContent =
    latestIssue?.type === "failed"
      ? "Cần chú ý lỗi gần nhất"
      : latestIssue?.type === "warning"
        ? "Có cảnh báo cần xem"
        : "Không có lỗi nổi bật";
  issueBannerMessage.textContent =
    latestIssue?.message ||
    "Khi phát sinh lỗi vận hành hoặc submit checkin thất bại, thông báo sẽ hiển thị ở đây.";

  lastSyncBadge.textContent = latestSyncAt
    ? `Lần đồng bộ gần nhất ${formatClockTime(latestSyncAt)}`
    : "Chưa có lần đồng bộ";

  updateSectionBadges();
  updateStatusSummary();
}

function updateStatusSummary() {
  statusIndicator.classList.remove("active", "alert");
  if (currentServiceRunning) {
    statusIndicator.classList.add("active");
    statusText.textContent = "Đang giám sát";
    statusMeta.textContent = `Polling mỗi ${formatPollIntervalMinutes(pollIntervalInput.value)} và chờ dữ liệu từ thiết bị`;
  } else {
    statusText.textContent = "Đã dừng";
    statusMeta.textContent = "Sẵn sàng cấu hình và khởi động";
  }
}

function hasDeviceConfig() {
  return getDevicesFromInputs().length > 0;
}

function hasApiConfig() {
  return (
    !!String(apiUrlInput.value || "").trim() &&
    !!String(apiKeyInput.value || "").trim() &&
    !!String(secretKeyInput.value || "").trim()
  );
}

function updateSectionBadges() {
  deviceSectionBadge.textContent = hasDeviceConfig()
    ? healthState.device.value
    : "Chưa sẵn sàng";
  apiSectionBadge.textContent = hasApiConfig()
    ? healthState.api.value
    : "Chưa sẵn sàng";
  syncSectionBadge.textContent = currentServiceRunning
    ? "Đang giám sát"
    : "Chưa kích hoạt";
}

async function testConfiguredDevices(devices, options = {}) {
  const { silentSuccess = false, throwOnFailure = true, logSuccess = true } = options;
  const normalizedDevices = (Array.isArray(devices) ? devices : [])
    .map((device, index) => normalizeDeviceEntry(device, index))
    .filter(Boolean);

  if (normalizedDevices.length === 0) {
    throw new Error("Cần khai báo ít nhất 1 máy chấm công");
  }

  const result = await window.electronAPI.testDevice({ devices: normalizedDevices });
  const results = Array.isArray(result?.results) ? result.results : [];
  results.forEach((item) => setDeviceResult(item.device, item));

  renderExtraDeviceList();
  renderDeviceDetails(getDevicesFromInputs());

  if (!result || !result.success) {
    const errorMessage = result?.error || "Không thể kết nối thiết bị";
    healthState.device.value = "Kết nối lỗi";
    healthState.device.meta = errorMessage;
    healthState.device.tone = "failed";
    updateOverview();
    if (throwOnFailure) throw new Error(errorMessage);
    return result;
  }

  const summary = formatDeviceInfoSummary(results);
  healthState.device.value = "Đã kết nối";
  healthState.device.meta = summary;
  healthState.device.tone = "success";
  if (logSuccess) addLog(`Device connection test: ${summary}`, "success");
  if (!silentSuccess) showToast(summary, "success");
  updateOverview();
  return result;
}

async function autoCheckConfiguredConnections() {
  const tasks = [];
  const configuredDevices = getDevicesFromInputs();

  if (configuredDevices.length > 0) {
    tasks.push(
      testConfiguredDevices(configuredDevices, {
        silentSuccess: true,
        throwOnFailure: false,
        logSuccess: false,
      })
        .then((result) => {
          if (result && result.success) {
            healthState.device.value = "Đã kết nối";
            healthState.device.meta = "Tự kiểm tra khi mở app: thiết bị phản hồi tốt";
            healthState.device.tone = "success";
          } else {
            healthState.device.value = "Kết nối lỗi";
            healthState.device.meta =
              result?.error || "Tự kiểm tra khi mở app không kết nối được thiết bị";
            healthState.device.tone = "failed";
          }
        })
        .catch((error) => {
          healthState.device.value = "Kết nối lỗi";
          healthState.device.meta = error?.message || String(error);
          healthState.device.tone = "failed";
        }),
    );
  }

  if (hasApiConfig()) {
    tasks.push(
      window.electronAPI
        .testApiConnection({
          apiUrl: (apiUrlInput.value || "").trim(),
          apiKey: (apiKeyInput.value || "").trim(),
          secretKey: (secretKeyInput.value || "").trim(),
          httpsRejectUnauthorized:
            currentConfig.httpsRejectUnauthorized !== undefined
              ? currentConfig.httpsRejectUnauthorized
              : false,
        })
        .then((result) => {
          if (result && result.success) {
            healthState.api.value = "Kết nối tốt";
            healthState.api.meta = "Tự kiểm tra khi mở app: API phản hồi thành công";
            healthState.api.tone = "success";
          } else {
            healthState.api.value = "Có lỗi";
            healthState.api.meta =
              result?.error || "Tự kiểm tra khi mở app không kết nối được API";
            healthState.api.tone = "failed";
          }
        })
        .catch((error) => {
          healthState.api.value = "Có lỗi";
          healthState.api.meta = error?.message || String(error);
          healthState.api.tone = "failed";
        }),
    );
  }

  if (tasks.length === 0) {
    updateOverview();
    return;
  }

  await Promise.allSettled(tasks);
  updateOverview();
}

function extractUserCounts(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "object") {
    if (value.userCounts !== undefined && value.userCounts !== null) {
      return value.userCounts;
    }
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        parsed.userCounts !== undefined &&
        parsed.userCounts !== null
      ) {
        return parsed.userCounts;
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function refreshStatsCards() {
  try {
    const [attendanceRes, usersRes] = await Promise.all([
      window.electronAPI.getTodayAttendance(),
      window.electronAPI.getUsers(),
    ]);

    const records =
      attendanceRes && attendanceRes.success ? attendanceRes.records || [] : [];
    const users = usersRes && usersRes.success ? usersRes.users || [] : [];

    totalAttendanceEl.textContent = String(records.length);
    totalUsersEl.textContent = String(users.length);

    let success = 0;
    let failed = 0;
    let pending = 0;
    let recordIssue = null;

    for (const record of records) {
      const status = String(record?.status || "pending").toLowerCase();
      if (status === "success") success++;
      else if (status === "failed") {
        failed++;
        if (!recordIssue) {
          const message = record?.sync_error
            ? `Bản ghi ${record?.user_id || "-"} lỗi: ${record.sync_error}`
            : `Bản ghi ${record?.user_id || "-"} đồng bộ thất bại`;
          recordIssue = {
            text: message.length > 140 ? `${message.slice(0, 137)}...` : message,
            meta: `Phát hiện từ dữ liệu hôm nay lúc ${formatClockTime()}`,
            message,
            type: "failed",
          };
        }
      } else pending++;
    }

    healthState.sync.success = success;
    healthState.sync.failed = failed;
    healthState.sync.pending = pending;

    if (!latestIssue && recordIssue) {
      latestIssue = recordIssue;
    }

    updateOverview();
  } catch {
    totalAttendanceEl.textContent = "0";
    totalUsersEl.textContent = "0";
  }
}

function startRealtimeTodayClock() {
  const tick = () => {
    if (!todayRealtimeEl) return;
    todayRealtimeEl.textContent = formatAttendanceTime(new Date());
  };
  tick();
  setInterval(tick, 1000);
}

function getAttendanceStatusMeta(value) {
  const rawStatus = String(value || "pending").toLowerCase();
  const status = rawStatus === "pending" ? "pending" : rawStatus;
  if (status === "success") {
    return { label: "Thành công", color: "#059669", chipClass: "success" };
  }
  if (status === "failed") {
    return { label: "Lỗi", color: "#dc2626", chipClass: "failed" };
  }
  return { label: "Chờ đồng bộ", color: "#d97706", chipClass: "pending" };
}

function getAttendanceDeviceKey(record) {
  const ip = String(record?.device_ip || record?.ip || "").trim();
  const port = String(record?.device_port || record?.port || "").trim();
  if (ip && port) return `${ip}:${port}`;
  if (ip) return ip;

  const deviceId = String(record?.device_id || record?.sn || record?.serialNumber || "").trim();
  return deviceId || "unknown";
}

function formatAttendanceDevice(record) {
  const name = String(record?.device_name || "").trim();
  const key = getAttendanceDeviceKey(record);
  const value = key === "unknown" ? "Không rõ máy" : key;
  return name ? `${name} (${value})` : value;
}

function buildAttendanceDeviceOptions(records = []) {
  const options = new Map();
  records.forEach((record) => {
    const key = getAttendanceDeviceKey(record);
    if (!options.has(key)) {
      options.set(key, formatAttendanceDevice(record));
    }
  });

  return Array.from(options.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], "vi"),
  );
}

function buildAttendanceRows(records) {
  return records
    .map((record, index) => {
      const meta = getAttendanceStatusMeta(record.status);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(record.user_id || "-")}</td>
          <td>${escapeHtml(record.user_name || "-")}</td>
          <td>${escapeHtml(formatAttendanceDevice(record))}</td>
          <td>${escapeHtml(
            formatAttendanceTime(
              record.record_time || record.timestamp || record.time || "-",
            ),
          )}</td>
          <td>
            <span class="modal-status-chip modal-status-${meta.chipClass}" style="color:${meta.color};">
              ${escapeHtml(meta.label)}
            </span>
          </td>
          <td class="modal-cell-muted">${escapeHtml(record.sync_error || "-")}</td>
        </tr>
      `;
    })
    .join("");
}

function buildAttendanceExcelDocument(records, selectedDate, filterLabel, searchKeyword, deviceFilterLabel) {
  const generatedAt = formatAttendanceTime(new Date());
  const rows = records
    .map((record, index) => {
      const meta = getAttendanceStatusMeta(record.status);
      const attendanceTime = formatAttendanceTime(
        record.record_time || record.timestamp || record.time || "-",
      );

      return `
        <tr>
          <td>${index + 1}</td>
          <td style="mso-number-format:'\\@';">${escapeHtml(record.user_id || "-")}</td>
          <td>${escapeHtml(record.user_name || "-")}</td>
          <td>${escapeHtml(formatAttendanceDevice(record))}</td>
          <td>${escapeHtml(attendanceTime)}</td>
          <td>${escapeHtml(meta.label)}</td>
          <td>${escapeHtml(record.sync_error || "-")}</td>
        </tr>
      `;
    })
    .join("");

  return `\ufeff<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d9e2ec; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; }
    .meta { color: #475569; margin-bottom: 12px; }
  </style>
</head>
<body>
  <h2>Danh sách chấm công ngày ${escapeHtml(selectedDate)}</h2>
  <div class="meta">
    Xuất lúc: ${escapeHtml(generatedAt)}<br>
    Bộ lọc trạng thái: ${escapeHtml(filterLabel)}<br>
    Bộ lọc máy: ${escapeHtml(deviceFilterLabel || "Tất cả máy")}<br>
    Từ khóa tìm kiếm: ${escapeHtml(searchKeyword || "Không có")}<br>
    Tổng số bản ghi xuất: ${records.length}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>User ID</th>
        <th>Tên</th>
        <th>Máy</th>
        <th>Thời gian</th>
        <th>Trạng thái</th>
        <th>Lỗi đồng bộ</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="7">Không có dữ liệu</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

function downloadHtmlFile(content, filename) {
  const blob = new Blob([content], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildUserRows(users) {
  return users
    .map(
      (user, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(user.user_id || "-")}</td>
          <td>${escapeHtml(user.name || "-")}</td>
          <td>${escapeHtml(user.uid ?? "-")}</td>
          <td>
            <div class="modal-actions">
              <button class="btn btn-secondary btn-user-edit" data-user-id="${escapeHtml(user.user_id || "")}" data-user-name="${escapeHtml(user.name || "")}" data-uid="${escapeHtml(user.uid ?? "")}">Sửa</button>
              <button class="btn btn-danger btn-user-delete" data-user-id="${escapeHtml(user.user_id || "")}" data-uid="${escapeHtml(user.uid ?? "")}">Xóa</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderModalTable({
  title,
  summary,
  toolbarHtml = "",
  tableHeadHtml,
  tableBodyHtml,
  emptyColspan,
  emptyText,
}) {
  openDataDialog(
    title,
    `
      <div class="modal-shell">
        <div class="modal-summary">${summary}</div>
        ${toolbarHtml ? `<div class="modal-toolbar">${toolbarHtml}</div>` : ""}
        <div class="modal-table-wrap">
          <table class="modal-table">
            <thead>${tableHeadHtml}</thead>
            <tbody id="modalTableBody">
              ${tableBodyHtml || `<tr><td colspan="${emptyColspan}" class="modal-empty">${escapeHtml(emptyText)}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `,
  );
}

async function openAttendanceDialog() {
  let selectedDate = formatDateInputValue(new Date());
  let activeStatusFilter = "all";
  let activeDeviceFilter = "all";
  let searchKeyword = "";
  let attendanceRecords = [];
  let attendanceSyncError = null;
  const statusFilterLabels = {
    all: "Tất cả",
    success: "Thành công",
    failed: "Lỗi",
    pending: "Chờ đồng bộ",
  };

  const loadAttendanceRecords = async () => {
    const result = await window.electronAPI.getAttendanceByDate(selectedDate);
    if (!result || !result.success) {
      throw new Error(result?.error || "Không tải được danh sách chấm công");
    }

    attendanceRecords = result.records || [];
    attendanceSyncError = result.syncError || null;
    if (attendanceSyncError) {
      showToast(
        `Đang hiển thị dữ liệu JSON cũ vì chưa đồng bộ được máy chấm công: ${attendanceSyncError}`,
        "warning",
      );
    }
  };

  const renderAttendanceTable = () => {
    const records = attendanceRecords;
    const filteredRecords = records.filter((record) => {
      const status = String(record?.status || "pending").toLowerCase();
      const matchStatus =
        activeStatusFilter === "all"
          ? true
          : activeStatusFilter === "pending"
            ? status !== "success" && status !== "failed"
            : status === activeStatusFilter;
      const deviceKey = getAttendanceDeviceKey(record);
      const matchDevice =
        activeDeviceFilter === "all" ? true : deviceKey === activeDeviceFilter;

      const keyword = searchKeyword.trim().toLowerCase();
      const searchableText = [
        record?.user_id,
        record?.user_name,
        formatAttendanceDevice(record),
        record?.device_id,
        record?.sn,
        record?.record_time,
        record?.timestamp,
        record?.time,
        record?.sync_error,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchStatus && matchDevice && (!keyword || searchableText.includes(keyword));
    });
    const deviceOptions = buildAttendanceDeviceOptions(records);
    const activeDeviceFilterLabel =
      activeDeviceFilter === "all"
        ? "Tất cả máy"
        : deviceOptions.find(([key]) => key === activeDeviceFilter)?.[1] || activeDeviceFilter;

    renderModalTable({
      title: `Danh sách chấm công ngày ${selectedDate} (${records.length})`,
      summary: attendanceSyncError
        ? `Hiển thị ${filteredRecords.length}/${records.length} bản ghi của ngày ${selectedDate}. Chưa đồng bộ được máy chấm công, đang dùng dữ liệu JSON hiện có.`
        : `Hiển thị ${filteredRecords.length}/${records.length} bản ghi của ngày ${selectedDate}. Dữ liệu đã được đồng bộ từ máy chấm công vào JSON trước khi hiển thị.`,
      toolbarHtml: `
        <div class="modal-toolbar-left">
          <div class="modal-search">
            <input id="attendanceSearchInput" type="text" placeholder="Tìm kiếm chấm công...">
          </div>
          <div class="modal-date-control">
            <label for="attendanceDateInput">Ngày</label>
            <input id="attendanceDateInput" type="date">
          </div>
          <div class="modal-date-control">
            <label for="attendanceDeviceFilter">Máy</label>
            <select id="attendanceDeviceFilter">
              <option value="all">Tất cả máy</option>
              ${deviceOptions
                .map(
                  ([key, label]) =>
                    `<option value="${escapeHtml(key)}" ${activeDeviceFilter === key ? "selected" : ""}>${escapeHtml(label)}</option>`,
                )
                .join("")}
            </select>
          </div>
          <button id="attendanceSyncDateBtn" class="btn btn-primary btn-compact" type="button">Đẩy dữ liệu ngày này</button>
          <button id="attendanceExportBtn" class="btn btn-success btn-compact" type="button">Xuất Excel</button>
        </div>
        <div class="modal-filter-group" id="attendanceStatusFilter">
          <button class="filter-chip ${activeStatusFilter === "all" ? "active" : ""}" data-status="all">Tất cả</button>
          <button class="filter-chip ${activeStatusFilter === "success" ? "active" : ""}" data-status="success">Thành công</button>
          <button class="filter-chip ${activeStatusFilter === "failed" ? "active" : ""}" data-status="failed">Lỗi</button>
          <button class="filter-chip ${activeStatusFilter === "pending" ? "active" : ""}" data-status="pending">Chờ đồng bộ</button>
        </div>
      `,
      tableHeadHtml: `
        <tr>
          <th>#</th>
          <th>User ID</th>
          <th>Tên</th>
          <th>Máy</th>
          <th>Thời gian</th>
          <th>Trạng thái</th>
          <th>Lỗi đồng bộ</th>
        </tr>
      `,
      tableBodyHtml: buildAttendanceRows(filteredRecords),
      emptyColspan: 7,
      emptyText: "Không có dữ liệu phù hợp với bộ lọc hiện tại",
    });

    const syncDateBtn = document.getElementById("attendanceSyncDateBtn");
    if (syncDateBtn) {
      syncDateBtn.addEventListener("click", async () => {
        syncDateBtn.disabled = true;
        syncDateBtn.textContent = "Đang đẩy...";
        addLog(`Bắt đầu đẩy dữ liệu chấm công ngày ${selectedDate}`, "info");

        try {
          const syncResult =
            await window.electronAPI.syncAttendanceByDate(selectedDate);

          if (!syncResult || !syncResult.success) {
            throw new Error(syncResult?.error || "Đẩy dữ liệu thất bại");
          }

          showToast(
            `Đã đẩy dữ liệu ngày ${syncResult.date || selectedDate}: ${syncResult.total || 0} bản ghi`,
            "success",
          );
          await loadAttendanceRecords();
          await refreshStatsCards();
          renderAttendanceTable();
        } catch (error) {
          showToast(`Đẩy dữ liệu thất bại: ${error.message}`, "failed");
        } finally {
          syncDateBtn.disabled = false;
          syncDateBtn.textContent = "Đẩy dữ liệu ngày này";
        }
      });
    }

    const exportBtn = document.getElementById("attendanceExportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", async () => {
        if (filteredRecords.length === 0) {
          showToast("Không có dữ liệu chấm công để xuất", "warning");
          return;
        }

        exportBtn.disabled = true;
        exportBtn.textContent = "Đang xuất...";

        const content = buildAttendanceExcelDocument(
          filteredRecords,
          selectedDate,
          statusFilterLabels[activeStatusFilter] || "Tất cả",
          searchKeyword.trim(),
          activeDeviceFilterLabel,
        );
        const defaultPath = `attendance-${selectedDate}.xls`;

        try {
          const result = await window.electronAPI.exportAttendanceFile({
            content,
            defaultPath,
          });

          if (result?.canceled) return;
          if (!result || !result.success) {
            throw new Error(result?.error || "Xuất Excel thất bại");
          }

          showToast(`Đã xuất Excel: ${result.filePath}`, "success");
        } catch (error) {
          downloadHtmlFile(content, defaultPath);
          showToast(
            "Đã xuất Excel bằng chế độ dự phòng. Hãy thoát hẳn app và mở lại để dùng hộp thoại lưu file.",
            "warning",
          );
        } finally {
          exportBtn.disabled = false;
          exportBtn.textContent = "Xuất Excel";
        }
      });
    }

    const searchInput = document.getElementById("attendanceSearchInput");
    if (searchInput) {
      searchInput.value = searchKeyword;
      searchInput.addEventListener("input", (event) => {
        searchKeyword = event.target.value || "";
        renderAttendanceTable();
      });
    }

    const dateInput = document.getElementById("attendanceDateInput");
    if (dateInput) {
      dateInput.value = selectedDate;
      dateInput.addEventListener("change", async (event) => {
        selectedDate = event.target.value || formatDateInputValue(new Date());
        activeDeviceFilter = "all";
        try {
          await loadAttendanceRecords();
          renderAttendanceTable();
        } catch (error) {
          showToast(error.message || "Không tải được danh sách chấm công", "failed");
        }
      });
    }

    const deviceFilterSelect = document.getElementById("attendanceDeviceFilter");
    if (deviceFilterSelect) {
      deviceFilterSelect.value = activeDeviceFilter;
      deviceFilterSelect.addEventListener("change", (event) => {
        activeDeviceFilter = event.target.value || "all";
        renderAttendanceTable();
      });
    }

    const filterContainer = document.getElementById("attendanceStatusFilter");
    if (filterContainer) {
      filterContainer.addEventListener("click", (event) => {
        const button = event.target.closest("[data-status]");
        if (!button) return;
        activeStatusFilter = button.getAttribute("data-status") || "all";
        renderAttendanceTable();
      });
    }
  };

  try {
    await loadAttendanceRecords();
    renderAttendanceTable();
  } catch (error) {
    showToast(error.message || "Không tải được danh sách chấm công", "failed");
  }
}

async function openUsersDialog() {
  const result = await window.electronAPI.getUsers();
  if (!result || !result.success) {
    showToast(result?.error || "Không tải được danh sách user", "failed");
    return;
  }

  const users = result.users || [];
  let searchKeyword = "";
  let processingMessage = "";

  const attachUsersDialogActions = () => {
    const syncBtn = document.getElementById("btnUserSync");
    if (syncBtn) {
      syncBtn.onclick = async () => {
        setUsersProcessing(true, "Đang sync toàn bộ user...");
        const syncRes = await window.electronAPI.syncUsers();
        if (!syncRes || !syncRes.success) {
          setUsersProcessing(false);
          showToast(syncRes?.error || "Sync user thất bại", "failed");
          return;
        }
        setUsersProcessing(false);
        showToast("Sync user thành công", "success");
        await refreshStatsCards();
        await openUsersDialog();
      };
    }

    const addBtn = document.getElementById("btnUserAdd");
    if (addBtn) {
      addBtn.onclick = async () => {
        try {
          const form = await window.showFormDialog({
            title: "Thêm user",
            submitText: "Lưu",
            fields: [
              { name: "user_id", label: "User ID" },
              { name: "name", label: "Tên" },
              { name: "password", label: "Password", type: "password" },
            ],
          });
          if (!form) return;

          const userId = (form.user_id || "").trim();
          if (!userId) {
            showToast("Thêm user thất bại: User ID là bắt buộc", "failed");
            addLog("Thêm user thất bại: User ID là bắt buộc", "failed");
            return;
          }

          const name = form.name || "";
          const uidInput = form.uid || "";
          const password = form.password || "";

          setUsersProcessing(true, `Đang thêm user ${userId}...`);

          const upsertRes = await window.electronAPI.upsertUser({
            mode: "create",
            user_id: userId,
            name,
            uid:
              uidInput && Number.isFinite(Number(uidInput))
                ? Number(uidInput)
                : undefined,
            password,
          });

          if (!upsertRes || !upsertRes.success) {
            const err = upsertRes?.error || "Thêm user thất bại";
            showToast(`Thêm user thất bại: ${err}`, "failed");
            setUsersProcessing(false);
            return;
          }

          setUsersProcessing(false);
          showToast("Thêm user thành công", "success");
          await refreshStatsCards();
          await openUsersDialog();
        } catch (error) {
          const err = error?.message || String(error);
          setUsersProcessing(false);
          showToast(`Thêm user lỗi: ${err}`, "failed");
        }
      };
    }

    document.querySelectorAll(".btn-user-edit").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const userId = button.getAttribute("data-user-id") || "";
          const oldName = button.getAttribute("data-user-name") || "";
          const uid = button.getAttribute("data-uid") || "";

          const form = await window.showFormDialog({
            title: `Sửa user ${userId}`,
            submitText: "Cập nhật",
            fields: [
              { name: "name", label: "Tên", value: oldName },
              {
                name: "password",
                label: "Password (để trống nếu không đổi)",
                type: "password",
              },
            ],
          });
          if (!form) return;

          const newName = form.name || "";
          const password = form.password || "";

          setUsersProcessing(true, `Đang cập nhật user ${userId}...`);

          const upsertRes = await window.electronAPI.upsertUser({
            mode: "update",
            user_id: userId,
            uid: uid && Number.isFinite(Number(uid)) ? Number(uid) : undefined,
            name: newName,
            password,
          });

          if (!upsertRes || !upsertRes.success) {
            const err = upsertRes?.error || "Sửa user thất bại";
            showToast(`Sửa user thất bại: ${err}`, "failed");
            setUsersProcessing(false);
            return;
          }

          setUsersProcessing(false);
          showToast("Sửa user thành công", "success");
          await refreshStatsCards();
          await openUsersDialog();
        } catch (error) {
          const err = error?.message || String(error);
          setUsersProcessing(false);
          showToast(`Sửa user lỗi: ${err}`, "failed");
        }
      });
    });

    document.querySelectorAll(".btn-user-delete").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const userId = button.getAttribute("data-user-id") || "";
          const uid = button.getAttribute("data-uid") || "";
          const confirmed = await window.showConfirmDialog(
            `Xóa user ${userId}?`,
            "Xác nhận xóa",
          );
          if (!confirmed) return;

          setUsersProcessing(true, `Đang xóa user ${userId}...`);

          const deleteRes = await window.electronAPI.deleteUser({
            user_id: userId,
            uid: uid && Number.isFinite(Number(uid)) ? Number(uid) : undefined,
          });

          if (!deleteRes || !deleteRes.success) {
            const err = deleteRes?.error || "Xóa user thất bại";
            showToast(`Xóa user thất bại: ${err}`, "failed");
            setUsersProcessing(false);
            return;
          }

          setUsersProcessing(false);
          showToast("Xóa user thành công", "success");
          await refreshStatsCards();
          await openUsersDialog();
        } catch (error) {
          const err = error?.message || String(error);
          setUsersProcessing(false);
          showToast(`Xóa user lỗi: ${err}`, "failed");
        }
      });
    });
  };

  const renderUsersTable = () => {
    const filteredUsers = users.filter((user) => {
      const keyword = searchKeyword.trim().toLowerCase();
      if (!keyword) return true;
      const searchableText = [user?.user_id, user?.name, user?.uid]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchableText.includes(keyword);
    });

    renderModalTable({
      title: `Danh sách user (${users.length})`,
      summary: `Hiển thị ${filteredUsers.length}/${users.length} user. Tìm theo User ID, tên hoặc UID.`,
      toolbarHtml: `
        <div class="modal-toolbar-left">
          <div class="modal-search">
            <input id="usersSearchInput" type="text" placeholder="Tìm kiếm user...">
          </div>
          <div class="modal-inline-actions">
            <button id="btnUserAdd" class="btn btn-primary">Thêm user</button>
            <button id="btnUserSync" class="btn btn-secondary">Sync toàn bộ user</button>
          </div>
        </div>
      `,
      tableHeadHtml: `
        <tr>
          <th>#</th>
          <th>User ID</th>
          <th>Tên</th>
          <th>UID</th>
          <th>Hành động</th>
        </tr>
      `,
      tableBodyHtml: buildUserRows(filteredUsers),
      emptyColspan: 5,
      emptyText: "Không có user phù hợp với từ khóa hiện tại",
    });

    const bodyEl = document.getElementById("dataDialogBody");
    if (bodyEl) {
      const processingEl = document.createElement("div");
      processingEl.id = "usersProcessing";
      processingEl.className = "modal-processing";
      processingEl.textContent = processingMessage || "Đang xử lý...";
      processingEl.style.display = processingMessage ? "block" : "none";
      bodyEl.prepend(processingEl);
    }

    const searchInput = document.getElementById("usersSearchInput");
    if (searchInput) {
      searchInput.value = searchKeyword;
      searchInput.addEventListener("input", (event) => {
        searchKeyword = event.target.value || "";
        renderUsersTable();
      });
    }

    attachUsersDialogActions();
  };

  renderUsersTable();

  const setUsersProcessing = (processing, message = "Đang xử lý...") => {
    processingMessage = processing ? message : "";
    const usersProcessingEl = document.getElementById("usersProcessing");
    if (usersProcessingEl) {
      usersProcessingEl.style.display = processing ? "block" : "none";
      usersProcessingEl.textContent = message;
    }

    const actionButtons = document.querySelectorAll(
      "#btnUserAdd, #btnUserSync, .btn-user-edit, .btn-user-delete",
    );
    actionButtons.forEach((button) => {
      button.disabled = !!processing;
    });
  };
}

function updateUIFromConfig(config) {
  const configuredDevices = Array.isArray(config.devices)
    ? config.devices
    : config.deviceIp
      ? [{ ip: config.deviceIp, port: config.devicePort, info: config.deviceInfo }]
      : [];
  renderDevicesToInputs(configuredDevices);
  if (config.apiUrl) apiUrlInput.value = config.apiUrl;
  if (config.secretKey) secretKeyInput.value = config.secretKey;
  if (config.apiKey) apiKeyInput.value = config.apiKey;
  if (config.pollInterval) {
    const pollIntervalMinutes = normalizePollIntervalMinutes(config.pollInterval);
    pollIntervalInput.value = pollIntervalMinutes;
    pollIntervalValue.textContent = formatPollIntervalMinutes(pollIntervalMinutes);
  }
  if (config.autoStart !== undefined) {
    autoStartCheckbox.checked = config.autoStart;
  }

  renderDeviceDetails(configuredDevices);

  updateSectionBadges();
}

function updateServiceStatus(status) {
  if (!status) return;

  currentServiceRunning = !!status.running;
  if (status.stats?.previousDayAutoSync) {
    applyPreviousDaySyncPayload(status.stats.previousDayAutoSync);
  }

  startServiceBtn.disabled = currentServiceRunning;
  stopServiceBtn.disabled = !currentServiceRunning;

  const inputs = [
    deviceIpInput,
    devicePortInput,
    extraDevicesInput,
    apiUrlInput,
    secretKeyInput,
    apiKeyInput,
    pollIntervalInput,
    autoStartCheckbox,
    saveConfigBtn,
  ];

  inputs.forEach((el) => {
    el.disabled = currentServiceRunning;
  });

  updateStatusSummary();
  updateSectionBadges();
}

async function init() {
  try {
    const version = await window.electronAPI.getVersion();
    document.getElementById("appVersion").textContent = `v${version}`;

    currentConfig = await window.electronAPI.getConfig();
    updateUIFromConfig(currentConfig);

    const status = await window.electronAPI.getServiceStatus();
    updateServiceStatus(status);
    if (window.electronAPI.getUpdateStatus) {
      const updateStatus = await window.electronAPI.getUpdateStatus();
      applyUpdateStatusPayload(updateStatus);
    }
    await refreshStatsCards();
    await autoCheckConfiguredConnections();
    renderLogs();
    updateOverview();
    startRealtimeTodayClock();
  } catch (error) {
    addLog(`Khởi tạo ứng dụng thất bại: ${error.message}`, "failed");
  }
}

pollIntervalInput.addEventListener("input", () => {
  pollIntervalValue.textContent = formatPollIntervalMinutes(pollIntervalInput.value);
  updateStatusSummary();
});

[deviceIpInput, devicePortInput, extraDevicesInput, apiUrlInput, apiKeyInput, secretKeyInput].forEach(
  (input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      updateSectionBadges();
    });
  },
);

if (addDeviceBtn) {
  addDeviceBtn.addEventListener("click", () => {
    const ip = String(extraDeviceIpInput?.value || "").trim();
    const port = String(extraDevicePortInput?.value || "4370").trim() || "4370";
    const name =
      String(extraDeviceNameInput?.value || "").trim() ||
      `Máy chấm công ${getDevicesFromInputs().length + 1}`;

    if (!ip) {
      showToast("Cần nhập IP máy chấm công bổ sung", "warning");
      return;
    }

    const nextDevice = normalizeDeviceEntry({ name, ip, port });
    const existingDevices = getDevicesFromInputs();
    if (
      existingDevices.some(
        (device) => device.ip === nextDevice.ip && device.port === nextDevice.port,
      )
    ) {
      showToast("Máy chấm công này đã có trong danh sách", "warning");
      return;
    }

    const extraDevices = [...getExtraDevicesFromStorage(), nextDevice];
    extraDevicesInput.value = serializeExtraDevices(extraDevices);
    if (extraDeviceNameInput) extraDeviceNameInput.value = "";
    if (extraDeviceIpInput) extraDeviceIpInput.value = "";
    if (extraDevicePortInput) extraDevicePortInput.value = "";
    renderExtraDeviceList();
    renderDeviceDetails(getDevicesFromInputs());
    updateSectionBadges();
    showToast("Đã thêm máy chấm công", "success");
  });
}

saveConfigBtn.addEventListener("click", async () => {
  saveConfigBtn.disabled = true;
  saveConfigBtn.textContent = "Đang lưu...";

  try {
    const newConfig = {
      devices: getDevicesFromInputs(),
      apiUrl: apiUrlInput.value,
      secretKey: secretKeyInput.value,
      apiKey: apiKeyInput.value,
      pollInterval: parseInt(pollIntervalInput.value, 10) * ONE_MINUTE_MS,
      autoStart: autoStartCheckbox.checked,
    };

    const result = await window.electronAPI.saveConfig(newConfig);
    if (!result || !result.success) {
      throw new Error(result?.error || "Lưu cấu hình thất bại");
    }

    currentConfig = newConfig;
    addLog("Đã lưu cấu hình hệ thống", "success");
    if (result.deviceErrors?.length > 0) {
      addLog(
        `Lưu cấu hình thành công, ${result.deviceErrors.length} máy chưa kiểm tra được kết nối`,
        "warning",
      );
    }
    showToast("Lưu cấu hình thành công", "success");
  } catch (error) {
    addLog(`Lưu cấu hình thất bại: ${error.message}`, "failed");
    showToast(error.message || "Lưu cấu hình thất bại", "failed");
  } finally {
    saveConfigBtn.disabled = false;
    saveConfigBtn.textContent = "Lưu cấu hình";
  }
});

testConnectionBtn.addEventListener("click", async () => {
  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = "Đang kiểm tra...";

  try {
    const apiUrl = (apiUrlInput.value || "").trim();
    const apiKey = (apiKeyInput.value || "").trim();
    const secretKey = (secretKeyInput.value || "").trim();

    if (!apiUrl || !apiKey || !secretKey) {
      throw new Error("API URL, API Key và Secret Key là bắt buộc");
    }

    new URL(apiUrl);

    const result = await window.electronAPI.testApiConnection({
      apiUrl,
      apiKey,
      secretKey,
      httpsRejectUnauthorized:
        currentConfig.httpsRejectUnauthorized !== undefined
          ? currentConfig.httpsRejectUnauthorized
          : false,
    });

    if (!result || !result.success) {
      throw new Error(result?.error || "Không kết nối được API");
    }

    healthState.api.value = "Kết nối tốt";
    healthState.api.meta = "Đã xác minh kết nối API thành công";
    healthState.api.tone = "success";
    addLog("API connection test successful", "success");
    showToast("Kết nối API thành công", "success");
    updateOverview();
  } catch (error) {
    healthState.api.value = "Có lỗi";
    healthState.api.meta = error.message;
    healthState.api.tone = "failed";
    addLog(`Connection test failed: ${error.message}`, "failed");
    showToast(`Kiểm tra API thất bại: ${error.message}`, "failed");
    updateOverview();
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = "Kiểm tra API";
  }
});

testDeviceBtn.addEventListener("click", async () => {
  testDeviceBtn.disabled = true;
  testDeviceBtn.textContent = "Đang kiểm tra...";

  try {
    const devices = getDevicesFromInputs();
    await testConfiguredDevices(devices);
  } catch (error) {
    healthState.device.value = "Kết nối lỗi";
    healthState.device.meta = error.message;
    healthState.device.tone = "failed";
    addLog(`Device connection failed: ${error.message}`, "failed");
    showToast(`Kiểm tra thiết bị thất bại: ${error.message}`, "failed");
    updateOverview();
  } finally {
    testDeviceBtn.disabled = false;
    testDeviceBtn.textContent = "Kiểm tra thiết bị";
  }
});

startServiceBtn.addEventListener("click", async () => {
  startServiceBtn.disabled = true;
  try {
    const result = await window.electronAPI.startService();
    addLog("Đã gửi yêu cầu bắt đầu giám sát", "info");
    if (!result.success) {
      throw new Error(result.error || "Khởi động dịch vụ thất bại");
    }
    if (result.status) {
      updateServiceStatus(result.status);
    }
  } catch (error) {
    addLog(`Khởi động dịch vụ thất bại: ${error.message}`, "failed");
    showToast(`Khởi động dịch vụ thất bại: ${error.message}`, "failed");
    startServiceBtn.disabled = false;
    stopServiceBtn.disabled = true;
  }
});

stopServiceBtn.addEventListener("click", async () => {
  stopServiceBtn.disabled = true;
  try {
    const result = await window.electronAPI.stopService();
    if (result && result.status) {
      updateServiceStatus(result.status);
    } else {
      const status = await window.electronAPI.getServiceStatus();
      updateServiceStatus(status);
    }
    addLog("Đã dừng giám sát", "warning");
  } catch (error) {
    addLog(`Dừng dịch vụ thất bại: ${error.message}`, "failed");
    showToast(`Dừng dịch vụ thất bại: ${error.message}`, "failed");
    stopServiceBtn.disabled = false;
  }
});

if (cardTotalAttendance) {
  cardTotalAttendance.addEventListener("click", openAttendanceDialog);
  cardTotalAttendance.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAttendanceDialog();
    }
  });
}

if (cardUsers) {
  cardUsers.addEventListener("click", openUsersDialog);
  cardUsers.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openUsersDialog();
    }
  });
}

if (openAttendanceAction) {
  openAttendanceAction.addEventListener("click", openAttendanceDialog);
}

if (openUsersAction) {
  openUsersAction.addEventListener("click", openUsersDialog);
}

if (logFiltersEl) {
  logFiltersEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    activeLogFilter = button.getAttribute("data-filter") || "all";
    logFiltersEl
      .querySelectorAll("[data-filter]")
      .forEach((chip) => chip.classList.remove("active"));
    button.classList.add("active");
    renderLogs();
  });
}

if (clearLogViewBtn) {
  clearLogViewBtn.addEventListener("click", () => {
    logEntries = [];
    latestIssue = null;
    renderLogs();
    updateOverview();
  });
}

window.electronAPI.onConfigLoaded((config) => {
  currentConfig = config;
  updateUIFromConfig(config);
});

window.electronAPI.onServiceStatus((status) => {
  updateServiceStatus(status);
});

window.electronAPI.onServiceError((error) => {
  addLog(`Error: ${error.message}`, "failed");
});

window.electronAPI.onConsoleLog((message, type) => {
  addLog(message, type);
});

window.electronAPI.onAttendanceUpdated((payload) => {
  latestSyncAt = new Date();
  applyPreviousDaySyncPayload(payload);
  if (
    payload &&
    payload.source !== "auto-previous-day" &&
    payload.date === formatDateInputValue(new Date()) &&
    Number.isFinite(Number(payload.total))
  ) {
    totalAttendanceEl.textContent = String(payload.total);
  }
  updateOverview();
  refreshStatsCards();
});

window.electronAPI.onUsersUpdated((payload) => {
  if (payload && Number.isFinite(Number(payload.total))) {
    totalUsersEl.textContent = String(payload.total);
  }
  refreshStatsCards();
});

if (window.electronAPI.onUpdateStatus) {
  window.electronAPI.onUpdateStatus((payload) => {
    applyUpdateStatusPayload(payload);
  });
}

init();
