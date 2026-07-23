// Helper wrapper for zkteco-js device calls with safer parsing
async function getSerialNumberSafe(device) {
  const keyword = "~SerialNumber";

  // device is ZktecoJs instance - use its functionWrapper to call underlying socket exec
  if (!device) throw new Error("Device instance required");

  try {
    // Call low-level executeCmd via functionWrapper to get raw buffer
    const data = await device.functionWrapper(
      () => device.ztcp.executeCmd(11, keyword),
      () => device.zudp.executeCmd(11, keyword),
      "CMD_OPTIONS_RRQ",
    );

    if (!data || !(data instanceof Buffer)) return null;

    const raw = data.slice(8).toString("utf-8");
    const clean = raw.split("\u0000")[0];
    const serialNumber = clean.split("=")[1]?.trim() || clean.trim();

    return serialNumber;
  } catch (err) {
    // bubble up for caller to handle
    throw err;
  }
}

module.exports = { getSerialNumberSafe };
