const axios = require("axios");
const https = require("https");

class ApiClient {
  constructor(config) {
    this.config = config;
    this.axiosInstance = null;
    this.hrSettingsCache = null;
    this.updateAxiosInstance();
  }

  getAuthHeaders() {
    const cfg = this.config.get();
    const apiKey = String(cfg.apiKey || "").trim();
    const secretKey = String(cfg.secretKey || "").trim();

    if (!apiKey || !secretKey) {
      throw new Error("Missing apiKey or secretKey");
    }

    return {
      Authorization: `token ${apiKey}:${secretKey}`,
      "Content-Type": "application/json",
    };
  }

  extractMessage(data) {
    if (data && Object.prototype.hasOwnProperty.call(data, "message")) {
      return data.message;
    }
    if (data && Object.prototype.hasOwnProperty.call(data, "data")) {
      return data.data;
    }
    return data;
  }

  updateAxiosInstance() {
    let cfg = this.config.get();
    let baseUrl = cfg.apiUrl || "";

    // Auto-fix common URL mistakes
    baseUrl = baseUrl.replace(/\/+$/, ""); // Remove trailing slash
    if (baseUrl.endsWith("/stores")) {
      baseUrl = baseUrl.substring(0, baseUrl.length - 7); // Remove /stores
    }

    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: cfg.httpsRejectUnauthorized !== false,
      }),
    });
    console.log("[API] Updated config:", {
      inputURL: cfg.apiUrl,
      resolvedBaseURL: baseUrl,
      hasSecret: !!cfg.secretKey,
    });
  }

  async postAttendanceLog({
    employeeFieldValue,
    timestamp,
    deviceId,
    latitude,
    longitude,
  }) {
    this.updateAxiosInstance();

    const endpoint =
      "/api/method/hrms.hr.doctype.employee_checkin.employee_checkin.add_log_based_on_employee_field";

    const payload = {
      employee_field_value: String(employeeFieldValue || "").trim(),
      timestamp: String(timestamp || "").trim(),
      device_id: String(deviceId || "").trim(),
    };

    const parsedLatitude = Number.parseFloat(latitude);
    const parsedLongitude = Number.parseFloat(longitude);

    if (Number.isFinite(parsedLatitude)) {
      payload.latitude = parsedLatitude;
    }

    if (Number.isFinite(parsedLongitude)) {
      payload.longitude = parsedLongitude;
    }

    const response = await this.axiosInstance.post(
      endpoint,
      payload,
      {
        headers: this.getAuthHeaders(),
      },
    );

    return response.data;
  }

  async getList(doctype, options = {}) {
    this.updateAxiosInstance();

    const params = {
      doctype: String(doctype || "").trim(),
      fields: JSON.stringify(options.fields || ["name"]),
      limit_page_length: options.limitPageLength || 20,
    };

    if (options.filters) {
      params.filters = JSON.stringify(options.filters);
    }

    if (options.orFilters) {
      params.or_filters = JSON.stringify(options.orFilters);
    }

    if (options.orderBy) {
      params.order_by = options.orderBy;
    }

    const response = await this.axiosInstance.get(
      "/api/method/frappe.client.get_list",
      {
        params,
        headers: this.getAuthHeaders(),
      },
    );

    const data = this.extractMessage(response.data);
    return Array.isArray(data) ? data : [];
  }

  async getValue(doctype, filters, fieldname) {
    this.updateAxiosInstance();

    const response = await this.axiosInstance.get(
      "/api/method/frappe.client.get_value",
      {
        params: {
          doctype: String(doctype || "").trim(),
          filters: JSON.stringify(filters || {}),
          fieldname: JSON.stringify(Array.isArray(fieldname) ? fieldname : [fieldname]),
        },
        headers: this.getAuthHeaders(),
      },
    );

    return this.extractMessage(response.data) || null;
  }

  async isGeolocationTrackingEnabled() {
    const now = Date.now();
    if (
      this.hrSettingsCache &&
      now - this.hrSettingsCache.fetchedAt < 60000
    ) {
      return this.hrSettingsCache.allowGeolocationTracking;
    }

    const settings = await this.getValue(
      "HR Settings",
      { name: "HR Settings" },
      ["allow_geolocation_tracking"],
    );

    const enabled = !!Number.parseInt(
      settings?.allow_geolocation_tracking,
      10,
    );

    this.hrSettingsCache = {
      allowGeolocationTracking: enabled,
      fetchedAt: now,
    };

    return enabled;
  }

  async getEmployeeByAttendanceDeviceId(employeeFieldValue) {
    const employees = await this.getList("Employee", {
      fields: ["name", "employee_name", "attendance_device_id"],
      filters: [["attendance_device_id", "=", String(employeeFieldValue || "").trim()]],
      limitPageLength: 1,
    });

    return employees[0] || null;
  }

  async getShiftLocationByEmployeeFieldValue(employeeFieldValue, timestamp) {
    const employee = await this.getEmployeeByAttendanceDeviceId(
      employeeFieldValue,
    );
    if (!employee?.name) {
      return null;
    }

    const attendanceDate = String(timestamp || "").trim().slice(0, 10);
    if (!attendanceDate) {
      return null;
    }

    const assignments = await this.getList("Shift Assignment", {
      fields: ["name", "shift_location", "shift_type", "start_date", "end_date"],
      filters: [
        ["employee", "=", employee.name],
        ["docstatus", "=", 1],
        ["status", "=", "Active"],
        ["shift_location", "is", "set"],
        ["start_date", "<=", attendanceDate],
      ],
      orFilters: [
        ["end_date", ">=", attendanceDate],
        ["end_date", "is", "not set"],
      ],
      orderBy: "start_date desc, modified desc",
      limitPageLength: 1,
    });

    const assignment = assignments[0];
    if (!assignment?.shift_location) {
      return null;
    }

    const locations = await this.getList("Shift Location", {
      fields: ["name", "latitude", "longitude", "checkin_radius"],
      filters: [["name", "=", assignment.shift_location]],
      limitPageLength: 1,
    });

    const location = locations[0];
    if (!location) {
      return null;
    }

    const latitude = Number.parseFloat(location.latitude);
    const longitude = Number.parseFloat(location.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      employee: employee.name,
      shiftType: assignment.shift_type || null,
      shiftLocation: assignment.shift_location,
      latitude,
      longitude,
      checkinRadius: Number.parseFloat(location.checkin_radius) || 0,
    };
  }

  async testAttendanceConnection(options = {}) {
    const apiUrl = String(options.apiUrl || "").trim();
    const apiKey = String(options.apiKey || "").trim();
    const secretKey = String(options.secretKey || "").trim();
    const httpsRejectUnauthorized =
      options.httpsRejectUnauthorized !== undefined
        ? options.httpsRejectUnauthorized
        : this.config.get().httpsRejectUnauthorized;

    if (!apiUrl || !apiKey || !secretKey) {
      throw new Error("API URL, API Key và Secret Key là bắt buộc");
    }

    const baseUrl = apiUrl.replace(/\/+$/, "");
    const tester = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: httpsRejectUnauthorized !== false,
      }),
      headers: {
        Authorization: `token ${apiKey}:${secretKey}`,
      },
    });

    const response = await tester.get("/api/method/ping");
    return {
      status: response.status,
      data: response.data,
    };
  }
}

module.exports = { ApiClient };
