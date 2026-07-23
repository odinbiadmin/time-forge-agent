const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Config
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  getVersion: () => ipcRenderer.invoke("get-version"),
  getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  testApiConnection: (payload) =>
    ipcRenderer.invoke("test-api-connection", payload),

  // Service control
  startService: () => ipcRenderer.invoke("start-service"),
  stopService: () => ipcRenderer.invoke("stop-service"),
  getServiceStatus: () => ipcRenderer.invoke("get-service-status"),
  // Test device connection (accepts ip and port)
  testDevice: (payloadOrIp, port) =>
    ipcRenderer.invoke(
      "test-device",
      typeof payloadOrIp === "object"
        ? payloadOrIp
        : { ip: payloadOrIp, port },
    ),

  // Attendance/User management
  getTodayAttendance: () => ipcRenderer.invoke("attendance-get-today"),
  getAttendanceByDate: (dateStr) =>
    ipcRenderer.invoke("attendance-get-by-date", dateStr),
  syncAttendanceByDate: (dateStr) =>
    ipcRenderer.invoke("attendance-sync-date", dateStr),
  exportAttendanceFile: (payload) =>
    ipcRenderer.invoke("attendance-export-file", payload),
  getUsers: () => ipcRenderer.invoke("attendance-get-users"),
  syncUsers: () => ipcRenderer.invoke("attendance-sync-users"),
  upsertUser: (user) => ipcRenderer.invoke("attendance-upsert-user", user),
  deleteUser: (user) => ipcRenderer.invoke("attendance-delete-user", user),

  // Event listeners
  onConfigLoaded: (callback) =>
    ipcRenderer.on("config-loaded", (event, config) => callback(config)),
  onServiceStatus: (callback) =>
    ipcRenderer.on("service-status", (event, status) => callback(status)),
  onServiceError: (callback) =>
    ipcRenderer.on("service-error", (event, error) => callback(error)),
  onConsoleLog: (callback) =>
    ipcRenderer.on("console-log", (event, message, type) =>
      callback(message, type),
    ),
  onAttendanceUpdated: (callback) =>
    ipcRenderer.on("attendance-updated", (event, payload) => callback(payload)),
  onUsersUpdated: (callback) =>
    ipcRenderer.on("users-updated", (event, payload) => callback(payload)),
  onUpdateStatus: (callback) =>
    ipcRenderer.on("update-status", (event, payload) => callback(payload)),
});
