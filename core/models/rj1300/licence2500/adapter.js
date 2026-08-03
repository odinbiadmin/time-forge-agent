const { RonaldJackRj1300Licence2500Client } = require("./client");

class RonaldJackRj1300Licence2500Adapter {
  constructor(options = {}) {
    this.id = "ronald-jack-rj1300-licence-2500-tcp";
    this.options = options;
    this.client = new RonaldJackRj1300Licence2500Client(options);
    this.metadata = null;
    this.operationQueue = Promise.resolve();
  }

  get connected() { return this.client.connected; }
  get connectionType() { return "ronald-jack-rj1300-licence-2500-tcp"; }

  async connect() {
    return this._run(async () => {
      await this.client.connect();
      return { connectionType: this.connectionType, machineNumber: this.client.machineNumber };
    });
  }

  async disconnect() {
    return this._run(() => this.client.disconnect());
  }

  async getSocketStatus() { return this.client.connected; }
  async freeData() {}

  async getAttendances() {
    return this._run(async () => ({ data: await this.client.getAttendances() }));
  }

  async getUsers() {
    return this._run(async () => ({ data: await this.client.getUsers() }));
  }

  async getInfo() {
    return this._run(async () => {
      const serialNumber = await this.client.getSerialNumber();
      this.metadata = {
        serialNumber,
        model: "RJ1300",
        modelName: "Ronald Jack RJ1300 (Licence 2500)",
        machineNumber: this.client.machineNumber,
        protocol: this.connectionType,
      };
      return this.metadata;
    });
  }

  async getDeviceName() { return "Ronald Jack RJ1300 (Licence 2500)"; }

  async getDeviceDetails() {
    const info = await this.getInfo();
    return { serialNumber: info.serialNumber, name: info.modelName, info };
  }

  async setUser() {
    throw new Error("RJ1300 Licence 2500 user write is not implemented; this adapter currently supports read-only operations");
  }

  async deleteUser() {
    throw new Error("RJ1300 Licence 2500 user delete is not implemented; this adapter currently supports read-only operations");
  }

  _run(action) {
    const operation = this.operationQueue.then(action, action);
    this.operationQueue = operation.catch(() => undefined);
    return operation;
  }
}

module.exports = { RonaldJackRj1300Licence2500Adapter };
