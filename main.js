const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { Config } = require("./core/config");
const { AttendanceService } = require("./core/attendance");
const { ApiClient } = require("./core/api");
const { DeviceDiagnosticsService } = require("./core/device_diagnostics");
let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (error) {
  autoUpdater = null;
}
// Enable automatic reload of main in dev mode
if (!app.isPackaged) {
  require("electron-reload")(__dirname, {
    electron: require(path.join(__dirname, "node_modules", "electron")),
    awaitWriteFinish: true,
    ignored: /node_modules|[\\/]dist[\\/]/,
  });
}

let mainWindow = null;
let tray = null;
let attendanceService = null;
let config = null;
let apiClient = null;
const deviceDiagnosticsService = new DeviceDiagnosticsService();
let updateStatus = {
  state: "idle",
  message: "Chưa kiểm tra cập nhật",
  version: null,
  percent: null,
};

const DEFAULT_UPDATE_GITHUB_REPO = "https://github.com/odinbiadmin/time-forge-agent";

if (process.platform === "win32") {
  app.setAppUserModelId("com.attendance.agent.desktop");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: "1000px",
    height: "700px",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "assets", "icon.ico"),
    autoHideMenuBar: true,
    show: false,
  });

  mainWindow.loadFile("renderer/index.html");
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    mainWindow.maximize();
    mainWindow.show();
  });

  // Open DevTools in development mode
  if (process.argv.includes("--dev")) {
    console.log("Opening DevTools...");
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "icon.ico");
  const icon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 16, height: 16 });

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show App",
      click: () => {
        mainWindow.show();
      },
    },
    {
      label: "Status",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Attendance Agent");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    mainWindow.show();
  });
}

function updateTrayStatus(status) {
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show App",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
          } else {
            createWindow();
          }
        },
      },
      {
        label: `Status: ${status}`,
        enabled: false,
      },
      {
        label: "Open DevTools (Debug)",
        click: () => {
          if (mainWindow) mainWindow.webContents.openDevTools();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
  }
}

function formatErrorMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.getError === "function") return formatErrorMessage(error.getError());
  if (error.command || error.ip) {
    const nested = formatErrorMessage(error.err);
    if (error.command === "TCP CONNECT") {
      return `Không mở được kết nối TCP tới ${error.ip || "thiết bị"}${nested && nested !== "Unknown error" && nested !== "{}" ? `: ${nested}` : ""}`;
    }
    const parts = [
      error.command ? `command=${error.command}` : null,
      error.ip ? `ip=${error.ip}` : null,
      nested && nested !== "Unknown error" && nested !== "{}" ? `detail=${nested}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Device command failed";
  }
  const detailParts = [
    error.code ? `code=${error.code}` : null,
    error.syscall ? `syscall=${error.syscall}` : null,
    error.address ? `address=${error.address}` : null,
    error.port ? `port=${error.port}` : null,
  ].filter(Boolean);
  if (detailParts.length > 0) return detailParts.join(", ");
  try {
    const json = JSON.stringify(error);
    return json && json !== "{}" ? json : String(error);
  } catch {
    return String(error);
  }
}

function emitUpdateStatus(nextStatus) {
  updateStatus = {
    ...updateStatus,
    ...nextStatus,
    updatedAt: new Date().toISOString(),
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", updateStatus);
  }

  sendLog(updateStatus.message, updateStatus.state === "error" ? "warning" : "info");
}

function parseGitHubRepoRef(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return null;

  const shorthandMatch = rawValue.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthandMatch) {
    return {
      owner: shorthandMatch[1],
      repo: shorthandMatch[2].replace(/\.git$/i, ""),
    };
  }

  const urlMatch = rawValue.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/?#].*)?$/i,
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2].replace(/\.git$/i, ""),
    };
  }

  return null;
}

function resolveUpdateFeedOptions() {
  const githubRepoRef =
    process.env.ATTENDANCE_UPDATE_GITHUB_REPO ||
    process.env.ATTENDANCE_UPDATE_REPO ||
    process.env.ATTENDANCE_UPDATE_URL ||
    DEFAULT_UPDATE_GITHUB_REPO;
  const githubRepo = parseGitHubRepoRef(githubRepoRef);

  if (githubRepo) {
    return {
      options: {
        provider: "github",
        owner: githubRepo.owner,
        repo: githubRepo.repo,
      },
      label: `GitHub Releases ${githubRepo.owner}/${githubRepo.repo}`,
    };
  }

  const updateUrl = String(process.env.ATTENDANCE_UPDATE_URL || "").trim();
  if (!updateUrl) return null;

  return {
    options: { provider: "generic", url: updateUrl },
    label: updateUrl,
  };
}

async function checkForAppUpdates({ manual = false } = {}) {
  if (!autoUpdater) {
    const message = "Auto update chưa sẵn sàng: thiếu electron-updater";
    emitUpdateStatus({ state: "disabled", message });
    return { success: false, skipped: true, error: message };
  }

  if (!app.isPackaged) {
    const message = "Auto update chỉ chạy trên bản app đã build/cài đặt";
    emitUpdateStatus({ state: "disabled", message });
    return { success: true, skipped: true, message };
  }

  const feed = resolveUpdateFeedOptions();
  if (!feed) {
    const message =
      "Auto update chưa cấu hình nguồn cập nhật";
    emitUpdateStatus({ state: "disabled", message });
    return { success: true, skipped: true, message };
  }

  try {
    autoUpdater.setFeedURL(feed.options);
    emitUpdateStatus({
      state: "checking",
      message: `Đang kiểm tra cập nhật từ ${feed.label}`,
      percent: null,
    });
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error) {
    const message = `Kiểm tra cập nhật thất bại: ${error.message || String(error)}`;
    emitUpdateStatus({ state: "error", message });
    if (manual) {
      return { success: false, error: message };
    }
    return { success: true, skipped: true, error: message };
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) {
    emitUpdateStatus({
      state: "disabled",
      message: "Auto update chưa sẵn sàng: thiếu electron-updater",
    });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    emitUpdateStatus({
      state: "checking",
      message: "Đang kiểm tra phiên bản mới",
      percent: null,
    });
  });

  autoUpdater.on("update-available", (info) => {
    emitUpdateStatus({
      state: "available",
      version: info?.version || null,
      message: `Có phiên bản mới ${info?.version || ""}, đang tải`,
    });
  });

  autoUpdater.on("update-not-available", () => {
    emitUpdateStatus({
      state: "current",
      message: "App đang ở phiên bản mới nhất",
      percent: null,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress?.percent || 0);
    emitUpdateStatus({
      state: "downloading",
      percent,
      message: `Đang tải bản cập nhật ${percent}%`,
    });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    emitUpdateStatus({
      state: "downloaded",
      version: info?.version || updateStatus.version,
      percent: 100,
      message: `Đã tải xong bản cập nhật ${info?.version || ""}`,
    });

    if (!mainWindow || mainWindow.isDestroyed()) return;

    const response = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Cài và khởi động lại", "Để lần sau"],
      defaultId: 0,
      cancelId: 1,
      title: "Có bản cập nhật mới",
      message: "Bản cập nhật đã tải xong.",
      detail: "Bạn có thể cài ngay bây giờ hoặc app sẽ tự cài khi thoát.",
    });

    if (response.response === 0) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on("error", (error) => {
    emitUpdateStatus({
      state: "error",
      message: `Auto update lỗi: ${error.message || String(error)}`,
    });
  });

  setTimeout(() => {
    checkForAppUpdates().catch(() => undefined);
  }, 5000);

  setInterval(() => {
    checkForAppUpdates().catch(() => undefined);
  }, 6 * 60 * 60 * 1000);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    config = new Config();
    apiClient = new ApiClient(config);
    attendanceService = new AttendanceService(config, apiClient);
    setupAttendanceListeners();

    createWindow();
    createTray();
    setupAutoUpdater();

    // Send initial config to renderer
    mainWindow.webContents.on("did-finish-load", () => {
      mainWindow.webContents.send("config-loaded", config.get());
    });

    // Auto-start printer service if configured
    const savedConfig = config.get();
    // Sync Windows startup settings
    app.setLoginItemSettings({
      openAtLogin: savedConfig.autoStart === true,
      path: app.getPath("exe"),
    });

    if (savedConfig.autoStart) {
      setTimeout(() => {
        attendanceService.start();
        updateTrayStatus("Running");
      }, 2000);
    }
  });
}

app.on("window-all-closed", () => {
  // Keep app running in tray
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (attendanceService) {
    attendanceService.stop();
  }
});

// IPC Handlers
ipcMain.handle("get-config", () => {
  return config.get();
});

ipcMain.handle("get-version", () => {
  return app.getVersion();
});

ipcMain.handle("check-for-updates", async () => {
  return checkForAppUpdates({ manual: true });
});

ipcMain.handle("get-update-status", () => {
  return updateStatus;
});

ipcMain.handle("test-api-connection", async (event, payload = {}) => {
  try {
    const result = await apiClient.testAttendanceConnection(payload);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle("save-config", async (event, newConfig) => {
  config.save(newConfig);

  const savedConfig = config.get();
  const devices = Array.isArray(savedConfig.devices) ? savedConfig.devices : [];
  const updatedDevices = [];
  const deviceErrors = [];

  for (const device of devices) {
    try {
      const info = await attendanceService.getDeviceInfo(device);
      updatedDevices.push({ ...device, info });

      const infoErrors = Array.isArray(info?.infoErrors) ? info.infoErrors : [];

      if (info?.infoSuccess === false) {
        deviceErrors.push({
          device,
          error: info.infoError || "Ket noi duoc nhung khong lay duoc thong tin may",
          connected: true,
        });
        sendLog(
          `Device connected but info fetch failed for ${device.name || device.ip}: ${info.infoError || "unknown info error"}`,
          "warning",
        );
      } else if (infoErrors.length > 0) {
        sendLog(
          `Device connected with partial info for ${device.name || device.ip}: ${infoErrors
            .map((item) => `${item.method}: ${item.message}`)
            .join(" | ")}`,
          "warning",
        );
      } else {
        sendLog(
          `Device info fetched: ${device.name || device.ip} (${device.ip}:${device.port || 4370})`,
          "success",
        );
      }
    } catch (error) {
      const errorMessage = formatErrorMessage(error);
      updatedDevices.push(device);
      deviceErrors.push({
        device,
        error: errorMessage,
        connected: false,
      });
      sendLog(
        `Device connection failed for ${device.name || device.ip}: ${errorMessage}`,
        "warning",
      );
    }
  }

  config.save({ devices: updatedDevices });

  // Update system startup settings
  app.setLoginItemSettings({
    openAtLogin: newConfig.autoStart === true,
    path: app.getPath("exe"),
  });

  if (mainWindow) {
    mainWindow.webContents.send("config-loaded", config.get());
  }

  return { success: true, deviceErrors };
});

// Test device connection from renderer
ipcMain.handle("test-device", async (event, payload = {}) => {
  const devices = Array.isArray(payload.devices)
    ? payload.devices
    : payload.ip
      ? [{ ip: payload.ip, port: payload.port }]
      : [];

  const results = [];
  for (const device of devices) {
    try {
      const info = await attendanceService.getDeviceInfo(device);
      results.push({
        success: true,
        connected: true,
        infoSuccess: info?.infoSuccess !== false,
        device,
        connection: { ip: info?.ip || device.ip, port: info?.port || device.port || 4370 },
        info,
        infoError: info?.infoError || null,
        infoErrors: Array.isArray(info?.infoErrors) ? info.infoErrors : [],
      });
    } catch (error) {
      const errorMessage = formatErrorMessage(error);
      results.push({
        success: false,
        connected: false,
        infoSuccess: false,
        device,
        error: errorMessage,
      });
    }
  }

  const success = results.some((result) => result.success);
  return {
    success,
    results,
    info: results.find((result) => result.success)?.info || null,
    error: success
      ? null
      : results.map((result) => result.error).filter(Boolean).join(" | "),
  };
});

ipcMain.handle("device-diagnostics-run", async (event, payload = {}) => {
  if (attendanceService?.getStatus()?.running) {
    return {
      success: false,
      error: "Hãy dừng giám sát trước khi chẩn đoán để tránh kết nối đồng thời tới thiết bị.",
    };
  }

  try {
    const report = await deviceDiagnosticsService.run(payload);
    return { success: true, report };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
});

ipcMain.handle("device-diagnostics-export", async (event, report = {}) => {
  try {
    if (!report || typeof report !== "object" || !report.startedAt) {
      throw new Error("Diagnostic report is required");
    }
    const safeModel = String(report.input?.model || "device").replace(/[^a-z0-9-_]+/gi, "-");
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Xuất báo cáo chẩn đoán máy chấm công",
      defaultPath: `device-diagnostic-${safeModel}-${String(report.startedAt).slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    await fs.promises.writeFile(result.filePath, JSON.stringify(report, null, 2), "utf8");
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
});

// Duplicate start-service handler removed

ipcMain.handle("stop-service", () => {
  const status = attendanceService.stop();
  updateTrayStatus("Stopped");
  return { success: true, status };
});

ipcMain.handle("get-service-status", () => {
  return attendanceService.getStatus();
});

ipcMain.handle("attendance-get-today", async () => {
  try {
    const records = attendanceService.getTodayAttendanceList();
    return { success: true, records };
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
      records: [],
    };
  }
});

ipcMain.handle("attendance-get-by-date", async (event, dateStr) => {
  try {
    const normalizedDateStr = String(dateStr || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateStr)) {
      throw new Error("Ngày không hợp lệ, cần đúng định dạng YYYY-MM-DD");
    }

    let syncError = null;
    try {
      await attendanceService.fetchAndSaveAttendanceByDate(normalizedDateStr, {
        updateTodayStats:
          normalizedDateStr === attendanceService.getLocalDateStr(new Date()),
        source: "history-view",
        syncToApi: false,
      });
    } catch (error) {
      syncError = error.message || String(error);
    }

    const records = attendanceService.getAttendanceByDate(normalizedDateStr);
    return {
      success: true,
      records,
      date: normalizedDateStr,
      syncedFromDevice: !syncError,
      syncError,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
      records: [],
    };
  }
});

ipcMain.handle("attendance-sync-date", async (event, dateStr) => {
  try {
    const normalizedDateStr = String(dateStr || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateStr)) {
      throw new Error("Ngày không hợp lệ, cần đúng định dạng YYYY-MM-DD");
    }

    const result = await attendanceService.fetchAndSaveAttendanceByDate(
      normalizedDateStr,
      {
        updateTodayStats:
          normalizedDateStr === attendanceService.getLocalDateStr(new Date()),
        source: "manual",
      },
    );

    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle("attendance-export-file", async (event, payload = {}) => {
  try {
    const content = String(payload.content || "");
    if (!content.trim()) {
      throw new Error("KhÃ´ng cÃ³ dá»¯ liá»‡u Ä‘á»ƒ xuáº¥t file");
    }

    const defaultPath = String(payload.defaultPath || "attendance-export.xls");
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Xuáº¥t Excel danh sÃ¡ch cháº¥m cÃ´ng",
      defaultPath,
      filters: [
        { name: "Excel Workbook", extensions: ["xls"] },
        { name: "HTML Table", extensions: ["html"] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    await fs.promises.writeFile(result.filePath, content, "utf8");
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle("attendance-get-users", async () => {
  try {
    const users = attendanceService.getUsersFromCache();
    return { success: true, users };
  } catch (error) {
    return { success: false, error: error.message || String(error), users: [] };
  }
});

ipcMain.handle("attendance-sync-users", async () => {
  try {
    const users = await attendanceService.syncAllUsers();
    return { success: true, users };
  } catch (error) {
    return { success: false, error: error.message || String(error), users: [] };
  }
});

ipcMain.handle("attendance-upsert-user", async (event, userData) => {
  try {
    const result = await attendanceService.upsertUser(userData || {});
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

ipcMain.handle("attendance-delete-user", async (event, userData) => {
  try {
    const users = await attendanceService.deleteUser(userData || {});
    return { success: true, users };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

// Helper to send logs to renderer
function sendLog(message, type = "default") {
  console.log(`[${type.toUpperCase()}] ${message}`);
  if (mainWindow) {
    mainWindow.webContents.send("console-log", message, type);
  }
}

function setupAttendanceListeners() {
  if (attendanceService) {
    attendanceService.on("status-change", (status) => {
      if (mainWindow) {
        mainWindow.webContents.send("service-status", status);
      }
      updateTrayStatus(status.running ? "Running" : "Stopped");
    });

    attendanceService.on("log", (data) => {
      sendLog(data.message, data.type);
    });

    attendanceService.on("error", (error) => {
      sendLog(`Attendance Error: ${error.message}`, "failed");
    });

    attendanceService.on("attendance-updated", (payload) => {
      if (mainWindow) {
        mainWindow.webContents.send("attendance-updated", payload);
      }
    });

    attendanceService.on("users-updated", (payload) => {
      if (mainWindow) {
        mainWindow.webContents.send("users-updated", payload);
      }
    });
  }
}

// Update IPC logging
ipcMain.handle("start-service", async () => {
  sendLog("Received start-service request", "info");
  try {
    sendLog("Calling attendanceService.start()", "info");
    const status = attendanceService.start();
    sendLog(
      `attendanceService.start() returned: ${JSON.stringify(status)}`,
      "success",
    );

    updateTrayStatus("Running");
    return { success: true, status };
  } catch (error) {
    sendLog(`Error in start-service: ${error.message}`, "failed");
    return { success: false, error: error.message };
  }
});
