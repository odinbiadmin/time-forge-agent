const net = require("net");
const {
  ACK_HEADER,
  DATA_HEADER,
  STATUS_HEADER,
  buildBlockAck,
  buildCommand,
  decodeAttendanceRecord,
  decodeUserRecord,
  validateFrame,
} = require("./protocol");

const DEFAULT_PORT = 4370;
const DEFAULT_TIMEOUT_MS = 15000;
const USER_PAGE_SIZE = 50;
const ATTENDANCE_BLOCK_SIZE = 100;
const MAX_USER_RECORDS = 100000;
const MAX_ATTENDANCE_RECORDS = 1000000;

function decodeDeviceText(buffer) {
  try {
    return new TextDecoder("windows-1258").decode(buffer).replace(/\0.*$/s, "").trim();
  } catch {
    return buffer.toString("utf8").replace(/\0.*$/s, "").trim();
  }
}

class RonaldJackRj1300Licence2500Client {
  constructor(options = {}) {
    this.ip = String(options.ip || "").trim();
    this.port = Number.parseInt(options.port, 10) || DEFAULT_PORT;
    this.machineNumber = 1;
    this.timeoutMs = Number.parseInt(options.timeoutMs, 10) || DEFAULT_TIMEOUT_MS;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pendingRead = null;
    this.lastError = null;
  }

  get connected() {
    return Boolean(this.socket && !this.socket.destroyed && this.socket.readyState === "open");
  }

  async connect() {
    if (this.connected) return;
    if (!this.ip) throw new Error("SK2500 device IP is required");
    await this.disconnect();
    this.buffer = Buffer.alloc(0);
    this.lastError = null;

    const socket = new net.Socket();
    this.socket = socket;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 5000);
    socket.on("data", (chunk) => {
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
      this._drainPendingRead();
    });
    socket.on("error", (error) => {
      this.lastError = error;
      this._rejectPendingRead(error);
    });
    socket.on("close", () => {
      this._rejectPendingRead(this.lastError || new Error("SK2500 connection closed"));
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`SK2500 connection timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        socket.off("connect", onConnect);
        socket.off("error", onError);
      };
      const onConnect = () => { cleanup(); resolve(); };
      const onError = (error) => { cleanup(); reject(error); };
      socket.once("connect", onConnect);
      socket.once("error", onError);
      socket.connect(this.port, this.ip);
    });

    try {
      await this._write(buildCommand(this.machineNumber, 0x52, 0, Buffer.alloc(6)));
      await this._readAck("connect ACK");
      await this._readStatus("connect status");
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect() {
    const socket = this.socket;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this._rejectPendingRead(new Error("SK2500 connection disconnected"));
    if (!socket || socket.destroyed) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => { socket.destroy(); resolve(); }, 250);
      socket.once("close", () => { clearTimeout(timer); resolve(); });
      socket.end();
    });
  }

  async getSerialNumber() {
    await this._ensureConnected();
    await this._write(buildCommand(this.machineNumber, 0x13, 1, Buffer.alloc(6)));
    await this._readAck("serial ACK");
    await this._readStatus("serial status");
    const frame = validateFrame(await this._readExact(38, "serial data"), DATA_HEADER, "serial data");
    return decodeDeviceText(frame.subarray(4, frame.length - 2));
  }

  async getUsers() {
    await this._ensureConnected();
    await this._write(buildCommand(this.machineNumber, 0x12, 1, Buffer.alloc(6)));
    await this._readAck("user list ACK");
    const initialStatus = await this._readStatus("user list status");
    const totalRecords = initialStatus.readUInt32LE(8);
    if (totalRecords > MAX_USER_RECORDS) {
      throw new Error(`SK2500 reported an invalid user record count (${totalRecords})`);
    }
    const usersById = new Map();

    for (let offset = 1; offset <= totalRecords; offset += USER_PAGE_SIZE) {
      const requestedCount = Math.min(USER_PAGE_SIZE, totalRecords - offset + 1);
      const payload = Buffer.alloc(6);
      payload.writeUInt32LE(requestedCount, 0);
      payload.writeUInt16LE(offset, 4);
      await this._write(buildCommand(this.machineNumber, 0x12, 1, payload));
      await this._readAck("user page ACK");
      const pageStatus = await this._readStatus("user page status");
      const returnedCount = pageStatus.readUInt32LE(8);
      if (returnedCount > requestedCount) {
        throw new Error(`SK2500 returned an invalid user page size (${returnedCount})`);
      }
      const frameLength = 4 + (returnedCount * 8) + 2;
      const frame = validateFrame(await this._readExact(frameLength, "user page data"), ACK_HEADER, "user page data");
      for (let index = 0; index < returnedCount; index += 1) {
        const row = decodeUserRecord(frame.subarray(4 + (index * 8), 12 + (index * 8)));
        if (!row.userId) continue;
        const previous = usersById.get(row.userId);
        if (!previous || row.backupNumber === 0) usersById.set(row.userId, row);
      }
      if (returnedCount === 0) break;
    }

    const users = [];
    for (const row of usersById.values()) {
      const name = await this.getUserName(row.userId);
      const id = String(row.userId);
      users.push({
        uid: row.userId,
        user_id: id,
        userid: id,
        name,
        role: row.privilege,
        privilege: row.privilege,
        enabled: row.enabled,
      });
    }
    return users;
  }

  async getUserName(userId) {
    await this._ensureConnected();
    const numericId = Number.parseInt(userId, 10);
    if (!Number.isInteger(numericId) || numericId < 1 || numericId > 0xffffffff) {
      throw new Error(`Invalid SK2500 user ID: ${userId}`);
    }
    const payload = Buffer.alloc(6);
    payload.writeUInt32LE(numericId, 0);
    await this._write(buildCommand(this.machineNumber, 0x1a, 1, payload));
    await this._readAck("user name ACK");
    await this._readStatus("user name status");
    const frame = validateFrame(await this._readExact(24, "user name data"), DATA_HEADER, "user name data");
    const bytes = frame.subarray(4, frame.length - 2);
    const end = bytes.indexOf(0);
    return decodeDeviceText(bytes.subarray(0, end >= 0 ? end : bytes.length));
  }

  async getAttendances() {
    await this._ensureConnected();
    const payload = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00, 0x00]);
    await this._write(buildCommand(this.machineNumber, 0x07, 1, payload));
    await this._readAck("attendance ACK");
    const countStatus = await this._readStatus("attendance count status");
    const totalRecords = countStatus.readUInt32LE(8);
    if (totalRecords > MAX_ATTENDANCE_RECORDS) {
      throw new Error(`SK2500 reported an invalid attendance record count (${totalRecords})`);
    }
    await this._readStatus("attendance transfer status");

    const records = [];
    let remaining = totalRecords;
    while (remaining > 0) {
      const blockCount = Math.min(ATTENDANCE_BLOCK_SIZE, remaining);
      await this._write(buildBlockAck(blockCount, this.machineNumber));
      const frameLength = 4 + (blockCount * 8) + 2;
      const frame = validateFrame(
        await this._readExact(frameLength, "attendance block"),
        ACK_HEADER,
        "attendance block",
      );
      for (let index = 0; index < blockCount; index += 1) {
        records.push(decodeAttendanceRecord(frame.subarray(4 + (index * 8), 12 + (index * 8))));
      }
      remaining -= blockCount;
    }
    await this._readStatus("attendance completion status");
    return records;
  }

  async _ensureConnected() {
    if (!this.connected) await this.connect();
  }

  async _write(buffer) {
    if (!this.socket || this.socket.destroyed) throw new Error("SK2500 socket is not connected");
    await new Promise((resolve, reject) => {
      this.socket.write(buffer, (error) => error ? reject(error) : resolve());
    });
  }

  async _readAck(label) {
    return validateFrame(await this._readExact(8, label), ACK_HEADER, label);
  }

  async _readStatus(label) {
    return validateFrame(await this._readExact(14, label), STATUS_HEADER, label);
  }

  _readExact(length, label) {
    if (this.pendingRead) return Promise.reject(new Error("Concurrent SK2500 socket reads are not supported"));
    if (this.buffer.length >= length) {
      const result = this.buffer.subarray(0, length);
      this.buffer = this.buffer.subarray(length);
      return Promise.resolve(result);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRead?.timer === timer) this.pendingRead = null;
        this.socket?.destroy();
        reject(new Error(`${label} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pendingRead = { length, resolve, reject, timer };
      this._drainPendingRead();
    });
  }

  _drainPendingRead() {
    const pending = this.pendingRead;
    if (!pending || this.buffer.length < pending.length) return;
    this.pendingRead = null;
    clearTimeout(pending.timer);
    const result = this.buffer.subarray(0, pending.length);
    this.buffer = this.buffer.subarray(pending.length);
    pending.resolve(result);
  }

  _rejectPendingRead(error) {
    const pending = this.pendingRead;
    if (!pending) return;
    this.pendingRead = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }
}

module.exports = {
  ATTENDANCE_BLOCK_SIZE,
  DEFAULT_PORT,
  DEFAULT_TIMEOUT_MS,
  MAX_ATTENDANCE_RECORDS,
  MAX_USER_RECORDS,
  RonaldJackRj1300Licence2500Client,
  USER_PAGE_SIZE,
};
