const COMMAND_HEADER = Buffer.from([0x55, 0xaa]);
const ACK_HEADER = Buffer.from([0x5a, 0xa5]);
const STATUS_HEADER = Buffer.from([0xaa, 0x55]);
const DATA_HEADER = Buffer.from([0xa5, 0x5a]);

function checksum(buffer, end = buffer.length) {
  let value = 0;
  for (let index = 0; index < end; index += 1) {
    value = (value + buffer[index]) & 0xffff;
  }
  return value;
}

function appendChecksum(bufferWithoutChecksum) {
  const result = Buffer.alloc(bufferWithoutChecksum.length + 2);
  bufferWithoutChecksum.copy(result);
  result.writeUInt16LE(checksum(bufferWithoutChecksum), bufferWithoutChecksum.length);
  return result;
}

function buildCommand(machineNumber, command, subcommand = 1, payload = Buffer.alloc(6)) {
  if (!Buffer.isBuffer(payload) || payload.length !== 6) {
    throw new Error("SK2500 command payload must contain exactly 6 bytes");
  }
  const machine = Number.parseInt(machineNumber, 10);
  if (!Number.isInteger(machine) || machine < 1 || machine > 255) {
    throw new Error("SK2500 machine number must be between 1 and 255");
  }

  const body = Buffer.alloc(14);
  COMMAND_HEADER.copy(body, 0);
  body[2] = machine;
  body[3] = 0;
  body[4] = 0x79;
  body[5] = 0x19;
  body[6] = command;
  body[7] = subcommand;
  payload.copy(body, 8);
  return appendChecksum(body);
}

function buildBlockAck(recordCount, machineNumber = 1) {
  const count = Number.parseInt(recordCount, 10);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("SK2500 block ACK requires a positive record count");
  }
  const machine = Number.parseInt(machineNumber, 10);
  if (!Number.isInteger(machine) || machine < 1 || machine > 255) {
    throw new Error("SK2500 machine number must be between 1 and 255");
  }
  const body = Buffer.alloc(8);
  ACK_HEADER.copy(body, 0);
  body[2] = machine;
  body[3] = 0;
  body.writeUInt32LE(count, 4);
  return appendChecksum(body);
}

function hasHeader(buffer, header) {
  return Buffer.isBuffer(buffer) && buffer.length >= 2 && buffer[0] === header[0] && buffer[1] === header[1];
}

function validateFrame(buffer, expectedHeader, label = "SK2500 frame") {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new Error(`${label} is incomplete`);
  }
  if (expectedHeader && !hasHeader(buffer, expectedHeader)) {
    throw new Error(`${label} has an unexpected header (${buffer.subarray(0, 2).toString("hex")})`);
  }
  const expected = buffer.readUInt16LE(buffer.length - 2);
  const actual = checksum(buffer, buffer.length - 2);
  if (expected !== actual) {
    throw new Error(`${label} checksum mismatch (expected ${expected}, received ${actual})`);
  }
  return buffer;
}

function decodePackedDateTime(value) {
  let packed = Number(value) >>> 0;
  const second = packed % 60;
  packed = Math.floor(packed / 60);
  const minute = packed % 60;
  packed = Math.floor(packed / 60);
  const hour = packed % 24;
  packed = Math.floor(packed / 24);
  const day = (packed % 31) + 1;
  packed = Math.floor(packed / 31);
  const month = (packed % 12) + 1;
  const year = Math.floor(packed / 12) + 2000;

  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second
  ) {
    throw new Error(`Invalid SK2500 packed date/time value: ${value}`);
  }
  return date;
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function decodeAttendanceRecord(record) {
  if (!Buffer.isBuffer(record) || record.length !== 8) {
    throw new Error("SK2500 attendance record must contain exactly 8 bytes");
  }
  const date = decodePackedDateTime(record.readUInt32LE(0));
  const identity = record.readUInt32LE(4);
  const userId = identity >>> 4;
  const verifyMode = identity & 0x0f;
  const normalizedUserId = String(userId);
  return {
    uid: userId,
    user_id: normalizedUserId,
    userid: normalizedUserId,
    record_time: formatLocalDateTime(date),
    timestamp: date.getTime(),
    state: verifyMode,
    type: verifyMode,
    verify_mode: verifyMode,
  };
}

function decodeUserRecord(record) {
  if (!Buffer.isBuffer(record) || record.length !== 8) {
    throw new Error("SK2500 user record must contain exactly 8 bytes");
  }
  const userId = record.readUInt32LE(0);
  return {
    userId,
    machineNumber: record[4],
    backupNumber: record[5],
    privilege: record[6],
    enabled: record[7] !== 0,
  };
}

module.exports = {
  ACK_HEADER,
  DATA_HEADER,
  STATUS_HEADER,
  appendChecksum,
  buildBlockAck,
  buildCommand,
  checksum,
  decodeAttendanceRecord,
  decodePackedDateTime,
  decodeUserRecord,
  formatLocalDateTime,
  hasHeader,
  validateFrame,
};
