/**
 * Làm sạch chuỗi tên user để hiển thị ổn định (loại ký tự control/thừa khoảng trắng).
 * @param {any} value Giá trị tên thô.
 * @returns {string}
 */
function normalizeUserName(value) {
  const raw = String(value || "");

  const sanitize = (text) =>
    String(text || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const tryDecodeLatin1ToUtf8 = (text) => {
    try {
      const decoded = Buffer.from(String(text || ""), "latin1").toString(
        "utf8",
      );
      return sanitize(decoded);
    } catch {
      return sanitize(text);
    }
  };

  const scoreText = (text) => {
    if (!text) return Number.MAX_SAFE_INTEGER;
    let score = 0;

    const replacementCount = (text.match(/�/g) || []).length;
    const mojibakeCount = (text.match(/Ã|Â|Ä|Å|Æ|Ð|Ñ/g) || []).length;
    const vietnameseCount = (
      text.match(
        /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi,
      ) || []
    ).length;

    score += replacementCount * 10;
    score += mojibakeCount * 4;
    score -= vietnameseCount;

    return score;
  };

  const cleanedRaw = sanitize(raw);
  if (!cleanedRaw) return "";

  const decodedOnce = tryDecodeLatin1ToUtf8(cleanedRaw);
  const decodedTwice = tryDecodeLatin1ToUtf8(decodedOnce);

  const candidates = [cleanedRaw, decodedOnce, decodedTwice].filter(Boolean);
  candidates.sort((a, b) => scoreText(a) - scoreText(b));

  return candidates[0] || cleanedRaw;
}

/**
 * Chuẩn hoá danh sách user từ thiết bị/cache về format chung.
 * @param {Array<object>} users Dữ liệu user thô.
 * @returns {Array<{uid:number|null,user_id:string,name:string,role:number|null,cardno:number|null}>}
 */
function normalizeUserList(users) {
  if (!Array.isArray(users)) return [];

  const normalized = users
    .map((user) => {
      if (!user || typeof user !== "object") return null;

      const id =
        user.userId ??
        user.user_id ??
        user.userid ??
        user.pin ??
        user.id ??
        user.uid;

      if (id === undefined || id === null || String(id).trim() === "") {
        return null;
      }

      const name =
        user.name ??
        user.user_name ??
        user.username ??
        user.full_name ??
        user.employee_name ??
        user.nickname ??
        user.realname ??
        "";

      return {
        uid:
          user.uid !== undefined && user.uid !== null
            ? Number.parseInt(user.uid, 10)
            : null,
        user_id: String(id).trim(),
        name: normalizeUserName(name),
        role:
          user.role !== undefined && user.role !== null
            ? Number.parseInt(user.role, 10)
            : null,
        cardno:
          user.cardno !== undefined && user.cardno !== null
            ? Number.parseInt(user.cardno, 10)
            : null,
      };
    })
    .filter(Boolean);

  const map = new Map();
  for (const user of normalized) {
    map.set(user.user_id, user);
  }

  return Array.from(map.values());
}

/**
 * Trích xuất mảng record chấm công từ nhiều cấu trúc dữ liệu khác nhau.
 * @param {any} data Dữ liệu attendance thô.
 * @returns {Array<object>}
 */
function extractAttendanceRecords(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.logs)) return data.logs;
  return [];
}

/**
 * Chuyển Date sang chuỗi ngày local định dạng YYYY-MM-DD.
 * @param {Date|string|number} date
 * @returns {string}
 */
function getLocalDateStr(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Kiểm tra một record có thuộc ngày cần lọc hay không.
 * @param {object} record Record attendance.
 * @param {string} dateStr Ngày mục tiêu định dạng YYYY-MM-DD.
 * @returns {boolean}
 */
function isRecordInDate(record, dateStr) {
  if (!record || typeof record !== "object") return false;

  const timeCandidates = [
    record.record_time,
    record.timestamp,
    record.time,
    record.recordTime,
    record.checkTime,
    record.punch_time,
    record.punchTime,
    record.date,
    record.datetime,
  ].filter(Boolean);

  if (timeCandidates.length === 0) return true;

  return timeCandidates.some((value) => {
    const text = String(value);
    if (text.startsWith(dateStr)) return true;

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return false;
    const parsedDate = getLocalDateStr(parsed);
    return parsedDate === dateStr;
  });
}

/**
 * Lọc dữ liệu attendance theo ngày hiện tại.
 * @param {any} rawData Dữ liệu attendance thô.
 * @param {string} dateStr Ngày mục tiêu định dạng YYYY-MM-DD.
 * @returns {any} Dữ liệu đã lọc theo ngày.
 */
function filterTodayAttendance(rawData, dateStr) {
  if (!rawData) return rawData;

  if (Array.isArray(rawData)) {
    return rawData.filter((item) => isRecordInDate(item, dateStr));
  }

  if (typeof rawData === "object") {
    if (Array.isArray(rawData.data)) {
      return {
        ...rawData,
        data: rawData.data.filter((item) => isRecordInDate(item, dateStr)),
      };
    }

    if (Array.isArray(rawData.logs)) {
      return {
        ...rawData,
        logs: rawData.logs.filter((item) => isRecordInDate(item, dateStr)),
      };
    }
  }

  return rawData;
}

/**
 * Bổ sung trường user_name cho từng record attendance dựa trên userMap.
 * @param {any} data Dữ liệu attendance (array/object).
 * @param {Map<string,string>} userMap Bảng map user_id -> name.
 * @returns {any} Dữ liệu đã enrich user_name.
 */
function annotateAttendanceDataWithNames(data, userMap) {
  const annotate = (record) => {
    if (!record || typeof record !== "object") return record;
    const id = String(record.user_id ?? "").trim();
    const userName = id ? userMap.get(id) || null : null;
    return { ...record, user_name: userName };
  };

  if (Array.isArray(data)) {
    return data.map(annotate);
  }

  if (data && typeof data === "object") {
    if (Array.isArray(data.data)) {
      return { ...data, data: data.data.map(annotate) };
    }

    if (Array.isArray(data.logs)) {
      return { ...data, logs: data.logs.map(annotate) };
    }
  }

  return data;
}

module.exports = {
  normalizeUserName,
  normalizeUserList,
  extractAttendanceRecords,
  getLocalDateStr,
  isRecordInDate,
  filterTodayAttendance,
  annotateAttendanceDataWithNames,
};
