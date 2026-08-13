const { runRonaldJackSdk } = require("./sdk");

// The legacy SDK is isolated in a short-lived x86 helper so the Electron
// process stays 64-bit and other device models remain independent.
class RonaldJackRj1300Licence3500Adapter {
  constructor(options) {
    this.id = "ronald-jack-rj1300-licence-3500-sdk";
    this.options = options;
    this.connected = false;
    this.metadata = null;
  }

  get connectionType() { return "ronald-jack-rj1300-licence-3500-fk623"; }

  async connect() {
    const result = await runRonaldJackSdk("connect", this.options);
    this.connected = true;
    return result;
  }

  async disconnect() { this.connected = false; }
  async getSocketStatus() { return this.connected; }
  async freeData() {}

  async getAttendances() {
    const result = await runRonaldJackSdk("attendance", this.options);
    return { data: result.records || [] };
  }

  async getUsers() {
    const result = await runRonaldJackSdk("users", this.options);
    return { data: result.users || [] };
  }

  // Keep write operations in the RJ1300 path.  Its FK623 SDK uses the
  // enrolment number (StringID where supported), rather than zkteco-js' UID.
  async upsertUser(userData = {}) {
    const userId = String(userData.userid ?? userData.user_id ?? userData.uid ?? "").trim();
    const name = String(userData.name ?? "").trim();
    if (!userId || !name) {
      throw new Error("RJ1300 requires userid and name");
    }

    return runRonaldJackSdk("upsertUser", {
      ...this.options,
      userId,
      userName: name,
      password: String(userData.password ?? ""),
      privilege: Number.parseInt(userData.role ?? userData.privilege ?? 0, 10) || 0,
      enabled: userData.enabled === false ? 0 : 1,
      cardNo: Number.parseInt(userData.cardno ?? userData.cardNo ?? 0, 10) || 0,
    });
  }

  // Compatibility with the generic attendance service's zkteco-js-shaped API.
  async setUser(uid, userid, name, password, role, cardno) {
    return this.upsertUser({ uid, userid, name, password, role, cardno });
  }

  async deleteUserByIdentity({ uid, userId, userid } = {}) {
    const id = String(userId ?? userid ?? uid ?? "").trim();
    if (!id) {
      throw new Error("RJ1300 requires userid for delete");
    }
    return runRonaldJackSdk("deleteUser", { ...this.options, userId: id });
  }

  async deleteUser(uid) {
    return this.deleteUserByIdentity({ uid });
  }

  async getInfo() {
    this.metadata = await runRonaldJackSdk("metadata", this.options);
    return this.metadata;
  }

  async getDeviceName() {
    const metadata = this.metadata || await this.getInfo();
    return metadata.modelName || metadata.model || "RJ1300";
  }

  async getDeviceDetails() {
    const metadata = await this.getInfo();
    return {
      serialNumber: metadata.serialNumber || null,
      name: metadata.modelName || metadata.model || "RJ1300",
      info: metadata,
    };
  }
}

module.exports = { RonaldJackRj1300Licence3500Adapter };
