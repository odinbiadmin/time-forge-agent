const {
  adapterRegistry,
  findDeviceAdapter,
  registerDeviceAdapter,
  RonaldJackRj1300Licence3500Adapter,
  RonaldJackRj1300Licence2500Adapter,
  ZktecoAdapter,
} = require("./device_adapters");

const DEFAULT_TIMEOUT_MS = 60000;

function errorMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function normalizeLogs(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.attendance)) return value.attendance;
  return [];
}

function inferModel(info) {
  const value = info?.name || info?.modelName || info?.model || info?.deviceName;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

class DeviceDiagnosticsService {
  async run(input = {}) {
    const model = String(input.model || "").trim();
    const ip = String(input.ip || "").trim();
    const port = Number.parseInt(input.port, 10) || 4370;
    const note = String(input.note || "").trim();
    if (!ip) throw new Error("Device IP is required");

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const selectedEntry = findDeviceAdapter({ model });
    const report = {
      version: 2,
      startedAt,
      finishedAt: null,
      input: { model, ip, port, note },
      adapter: { id: selectedEntry.id, selectedBy: model ? "configured-model" : "default" },
      connection: { connected: false, protocol: null },
      steps: [],
      metadata: {},
      metadataErrors: [],
      detectedModel: null,
      attendance: { total: 0, preview: [], records: [] },
      outcome: "connection_failed",
      error: null,
      durationMs: 0,
    };
    const adapter = selectedEntry.create({ ...input, model, ip, port });
    const recordStep = async (name, action) => {
      const begin = Date.now();
      try {
        const value = await action();
        report.steps.push({ name, status: "success", durationMs: Date.now() - begin });
        return value;
      } catch (error) {
        const message = errorMessage(error);
        report.steps.push({ name, status: "failed", durationMs: Date.now() - begin, error: message });
        throw new Error(message);
      }
    };

    try {
      const connection = await recordStep("connect", () => withTimeout(adapter.connect(), DEFAULT_TIMEOUT_MS, "Device connection"));
      report.connection = { connected: true, protocol: connection?.connectionType || adapter.connectionType || null };

      const details = await recordStep("read_device_info", () => adapter.getDeviceDetails());
      report.metadata = details?.info || details || {};
      report.detectedModel = inferModel(details);

      const raw = await recordStep("read_attendance", () => adapter.getAttendances());
      const records = normalizeLogs(raw);
      report.attendance = { total: records.length, rawType: adapter.id, preview: records.slice(0, 20), records };
      report.outcome = records.length > 0 ? "read_success" : "read_empty";
    } catch (error) {
      report.error = errorMessage(error);
      report.outcome = report.connection.connected ? "read_failed" : "connection_failed";
    } finally {
      try {
        await adapter.disconnect();
        report.steps.push({ name: "disconnect", status: "success", durationMs: 0 });
      } catch (error) {
        report.steps.push({ name: "disconnect", status: "failed", durationMs: 0, error: errorMessage(error) });
      }
      report.finishedAt = new Date().toISOString();
      report.durationMs = Date.now() - startedMs;
    }
    return report;
  }
}

module.exports = {
  adapterRegistry,
  DeviceDiagnosticsService,
  DefaultZktecoAdapter: ZktecoAdapter,
  RonaldJackRj1300Licence3500Adapter,
  RonaldJackRj1300Licence2500Adapter,
  inferModel,
  normalizeLogs,
  registerDeviceAdapter,
};
