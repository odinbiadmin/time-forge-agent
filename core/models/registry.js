const { RonaldJackRj1300Licence3500Adapter } = require("./rj1300/licence3500/adapter");
const { RonaldJackRj1300Licence2500Adapter } = require("./rj1300/licence2500/adapter");
const { ZktecoAdapter } = require("./zkteco/adapter");

function normalizeModel(value) {
  return String(value || "").replace(/[\s_-]+/g, "").toUpperCase();
}

const adapterRegistry = [
  {
    id: "ronald-jack-rj1300-licence-2500-tcp",
    matches: (device) => ["RJ13002500", "RONALDJACKRJ13002500", "SK2500", "RONALDJACKSK2500", "RONALDJACK2500", "LICENCE2500"].includes(normalizeModel(device?.model || device?.driver)),
    create: (device) => new RonaldJackRj1300Licence2500Adapter(device),
  },
  {
    id: "ronald-jack-rj1300-licence-3500-sdk",
    matches: (device) => ["RJ1300", "RJ13003500", "RONALDJACKRJ1300", "RONALDJACKRJ13003500"].includes(normalizeModel(device?.model || device?.driver)),
    create: (device) => new RonaldJackRj1300Licence3500Adapter(device),
  },
  {
    id: "default-zkteco",
    matches: () => true,
    create: (device) => new ZktecoAdapter(device),
  },
];

function registerDeviceAdapter(entry) {
  if (!entry?.id || typeof entry.matches !== "function" || typeof entry.create !== "function") {
    throw new Error("Adapter requires id, matches and create");
  }
  adapterRegistry.unshift(entry);
}

function findDeviceAdapter(device) {
  return adapterRegistry.find((entry) => entry.matches(device)) || adapterRegistry[adapterRegistry.length - 1];
}

function createDeviceAdapter(device) {
  return findDeviceAdapter(device).create(device);
}

module.exports = {
  adapterRegistry,
  createDeviceAdapter,
  findDeviceAdapter,
  normalizeModel,
  registerDeviceAdapter,
};
