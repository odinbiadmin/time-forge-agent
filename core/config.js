const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const SECRET_FIELDS = ["apiKey", "secretKey"];
const ENCRYPTED_PREFIX = "enc:v1:";

function normalizeDeviceModel(value) {
  const model = String(value || "zkteco").trim() || "zkteco";
  const normalized = model.replace(/[\s_-]+/g, "").toUpperCase();
  if (["RJ1300", "RONALDJACKRJ1300"].includes(normalized)) return "RJ1300-3500";
  if (["SK2500", "RONALDJACKSK2500", "RONALDJACK2500", "LICENCE2500"].includes(normalized)) return "RJ1300-2500";
  return model;
}

class Config {
  constructor() {
    this.configPath = path.join(app.getPath("userData"), "config.json");
    this.config = this.load();
    if (this.configNeedsMigration(this.config)) {
      this.save(this.config);
    }
  }

  canUseSafeStorage() {
    return !!safeStorage && safeStorage.isEncryptionAvailable();
  }

  encryptSecret(value) {
    const text = String(value || "");
    if (!text) return "";
    if (!this.canUseSafeStorage()) {
      console.warn("safeStorage is not available; secret was not persisted");
      return "";
    }
    return `${ENCRYPTED_PREFIX}${safeStorage.encryptString(text).toString("base64")}`;
  }

  decryptSecret(value) {
    const text = String(value || "");
    if (!text.startsWith(ENCRYPTED_PREFIX)) return text;
    if (!this.canUseSafeStorage()) return "";

    try {
      const encrypted = Buffer.from(text.slice(ENCRYPTED_PREFIX.length), "base64");
      return safeStorage.decryptString(encrypted);
    } catch (error) {
      console.error("Error decrypting config secret:", error);
      return "";
    }
  }

  normalizeDevices(config) {
    const devices = Array.isArray(config?.devices)
      ? config.devices
      : config?.deviceIp
        ? [
            {
              ip: config.deviceIp,
              port: config.devicePort || "4370",
              info: config.deviceInfo || null,
            },
          ]
        : [];

    return devices
      .map((device, index) => {
        const ip = String(device?.ip ?? device?.deviceIp ?? "").trim();
        if (!ip) return null;
        const port = String(device?.port ?? device?.devicePort ?? "4370").trim();
        return {
          id: `${ip}:${port}`,
          ip,
          port,
          info: device?.info || null,
          model: normalizeDeviceModel(device?.model || device?.driver),
          // Connection constants are selected by the adapter profile, not user input.
          networkPassword: Number.parseInt(device?.networkPassword, 10) || 0,
          sdkDirectory: String(device?.sdkDirectory || "").trim() || undefined,
        };
      })
      .filter(Boolean);
  }

  hydrateConfig(config) {
    const hydrated = { ...(config || {}) };
    for (const field of SECRET_FIELDS) {
      const encryptedField = `${field}Encrypted`;
      if (hydrated[encryptedField]) {
        hydrated[field] = this.decryptSecret(hydrated[encryptedField]);
      }
    }

    hydrated.devices = this.normalizeDevices(hydrated);
    const primaryDevice = hydrated.devices[0] || null;
    hydrated.deviceIp = primaryDevice?.ip || "";
    hydrated.devicePort = primaryDevice?.port || "";
    hydrated.deviceInfo = primaryDevice?.info || hydrated.deviceInfo || null;
    return hydrated;
  }

  prepareConfigForDisk(config) {
    const diskConfig = { ...(config || {}) };
    diskConfig.devices = this.normalizeDevices(diskConfig);
    const primaryDevice = diskConfig.devices[0] || null;
    diskConfig.deviceIp = primaryDevice?.ip || "";
    diskConfig.devicePort = primaryDevice?.port || "";
    diskConfig.deviceInfo = primaryDevice?.info || null;

    for (const field of SECRET_FIELDS) {
      const encryptedField = `${field}Encrypted`;
      const plainValue = String(diskConfig[field] || "");
      if (plainValue) {
        diskConfig[encryptedField] = this.encryptSecret(plainValue);
      } else if (!diskConfig[encryptedField]) {
        diskConfig[encryptedField] = "";
      }
      delete diskConfig[field];
    }

    return diskConfig;
  }

  configNeedsMigration(config) {
    if (!config || typeof config !== "object") return false;
    return SECRET_FIELDS.some((field) => !!config[field]) || !Array.isArray(config.devices);
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf8");
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === "object") {
          delete parsed.storeId;
          delete parsed.storeName;
        }
        return this.hydrateConfig(parsed);
      }
    } catch (error) {
      console.error("Error loading config:", error);
    }

    // Default configuration
    return this.hydrateConfig({
      deviceIp: "",
      devicePort: "",
      deviceInfo: null,
      devices: [],
      apiUrl: "https://domain.com/",
      secretKey: "",
      apiKey: "",
      pollInterval: 60 * 60 * 1000,
      autoStart: false,
      httpsRejectUnauthorized: false, // Allow self-signed certificates
    });
  }

  save(newConfig) {
    try {
      this.config = { ...this.config, ...newConfig };
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.prepareConfigForDisk(this.config), null, 2),
      );
      this.config = this.hydrateConfig(this.prepareConfigForDisk(this.config));
      return true;
    } catch (error) {
      console.error("Error saving config:", error);
      return false;
    }
  }

  get() {
    return { ...this.config };
  }

  set(key, value) {
    this.config[key] = value;
    this.save(this.config);
  }
}

module.exports = { Config };
