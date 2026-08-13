const Zkteco = require("zkteco-js");
const { getSerialNumberSafe } = require("../../zk_helpers");

class ZktecoAdapter {
  constructor(options) {
    this.id = "default-zkteco";
    this.options = options;
    this.device = new Zkteco(options.ip, options.port, 15000, 5000);
    this.connected = false;
  }

  get connectionType() { return this.device?.connectionType; }
  get ztcp() { return this.device?.ztcp; }
  get zudp() { return this.device?.zudp; }

  async connect() {
    await this.device.createSocket();
    this.connected = true;
    return { connectionType: this.connectionType || "zkteco" };
  }

  async disconnect() {
    try { await this.device?.disconnect(); } finally { this.connected = false; }
  }

  async getSocketStatus() {
    if (!this.connected) return false;
    if (typeof this.device.getSocketStatus === "function") return this.device.getSocketStatus();
    if (this.connectionType === "tcp") return !!this.device?.ztcp?.socket;
    if (this.connectionType === "udp") return !!this.device?.zudp?.socket;
    return false;
  }

  async getAttendances() { return this.device.getAttendances(); }
  async getUsers() { return this.device.getUsers(); }
  async getInfo() { return this.device.getInfo(); }
  async getDeviceName() { return this.device.getDeviceName(); }
  async getDeviceVersion() { return this.device.getDeviceVersion(); }
  async getPlatform() { return this.device.getPlatform(); }
  async getOS() { return this.device.getOS(); }
  async setUser(...args) { return this.device.setUser(...args); }
  async deleteUser(...args) { return this.device.deleteUser(...args); }
  async freeData() { return this.device.freeData?.(); }

  async getDeviceDetails() {
    const [serialNumber, name, info] = await Promise.all([
      getSerialNumberSafe(this.device).catch(() => null),
      this.device.getDeviceName().catch(() => null),
      this.device.getInfo().catch(() => null),
    ]);
    return { serialNumber, name, info };
  }
}

module.exports = { ZktecoAdapter };
