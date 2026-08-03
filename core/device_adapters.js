// Compatibility facade. Model implementations live under core/models/.
const registry = require("./models/registry");
const { RonaldJackRj1300Licence3500Adapter } = require("./models/rj1300/licence3500/adapter");
const { RonaldJackRj1300Licence2500Adapter } = require("./models/rj1300/licence2500/adapter");
const { ZktecoAdapter } = require("./models/zkteco/adapter");

module.exports = { ...registry, RonaldJackRj1300Licence3500Adapter, RonaldJackRj1300Licence2500Adapter, ZktecoAdapter };
