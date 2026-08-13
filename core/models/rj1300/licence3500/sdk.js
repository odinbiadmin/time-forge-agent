const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const DEFAULT_MACHINE_NUMBER = 1;
const DEFAULT_SDK_LICENSE = 1261;
const DEFAULT_TIMEOUT_MS = 60000;
const BUNDLED_SDK_DIRECTORY = path.resolve(__dirname, "../../../../assets/rj1300-sdk");

function getPowerShellPath() {
  const windowsDir = process.env.WINDIR || "C:\\Windows";
  return path.join(windowsDir, "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function getSdkPaths(options = {}) {
  const developmentBridge = path.join(__dirname, "rj1300_bridge.ps1");
  const packagedSdkDirectory = path.join(process.resourcesPath || "", "rj1300-sdk");
  const packagedBridge = path.join(process.resourcesPath || "", "rj1300-sdk", "rj1300_bridge.ps1");
  const usePackagedSdk = Boolean(process.resourcesPath && fs.existsSync(packagedBridge));
  const sdkDirectory = String(options.sdkDirectory || (usePackagedSdk ? packagedSdkDirectory : BUNDLED_SDK_DIRECTORY));
  const scriptPath = usePackagedSdk ? packagedBridge : developmentBridge;
  return { sdkDirectory, scriptPath };
}

function runRonaldJackSdk(operation, options = {}) {
  const ip = String(options.ip || "").trim();
  if (!ip) return Promise.reject(new Error("Device IP is required"));

  const operationTimeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const { sdkDirectory, scriptPath } = getSdkPaths(options);
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
    "-Operation", operation,
    "-Ip", ip,
    "-Port", String(Number(options.port) || 4370),
    "-MachineNumber", String(DEFAULT_MACHINE_NUMBER),
    "-NetworkPassword", String(Number(options.networkPassword) || 0),
    // This is the internal FK623 SDK product code used by Ronald Jack Software.
    // It is not the customer registration key displayed by the legacy UI.
    "-License", String(DEFAULT_SDK_LICENSE),
    "-TimeoutMs", String(Math.min(operationTimeoutMs, 30000)),
    "-SdkDirectory", sdkDirectory,
  ];

  if (operation === "upsertUser" || operation === "deleteUser") {
    args.push("-UserId", String(options.userId ?? options.userid ?? options.user_id ?? ""));
  }
  if (operation === "upsertUser") {
    args.push(
      "-UserName", String(options.userName ?? options.name ?? ""),
      "-Password", String(options.password ?? ""),
      "-Privilege", String(Number.parseInt(options.privilege ?? options.role ?? 0, 10) || 0),
      "-Enabled", String(options.enabled === false || Number(options.enabled) === 0 ? 0 : 1),
      "-CardNo", String(Number.parseInt(options.cardNo ?? options.cardno ?? 0, 10) || 0),
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(getPowerShellPath(), args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill();
    }, operationTimeoutMs);

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", (error) => {
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch {
        reject(new Error(stderr.trim() || stdout.trim() || `Ronald Jack SDK helper exited with code ${code}`));
        return;
      }
      if (code !== 0 || !result.success) {
        reject(new Error(result.error || stderr.trim() || "Ronald Jack SDK operation failed"));
        return;
      }
      resolve(result);
    });
  });
}

module.exports = {
  DEFAULT_MACHINE_NUMBER,
  BUNDLED_SDK_DIRECTORY,
  DEFAULT_SDK_LICENSE,
  getSdkPaths,
  runRonaldJackSdk,
};
