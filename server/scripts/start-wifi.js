import os from "node:os";

const lanAddress = await waitForLanAddress();

if (!lanAddress) {
  console.error("Could not find a normal local Wi Fi or LAN IPv4 address.");
  console.error("Make sure this Mac is connected to the same network as the Kobo.");
  process.exit(1);
}

process.env.HOST = lanAddress;
process.env.SYNC_TARGET = "wifi";

await import("../src/index.js");

async function waitForLanAddress() {
  const timeoutMs = 120000;
  const intervalMs = 2000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const address = findLanAddress();
    if (address) {
      return address;
    }

    console.log("Waiting for Wi Fi or LAN address...");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return "";
}

function findLanAddress() {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address);

  return (
    addresses.find((address) => address.startsWith("192.168.")) ||
    addresses.find((address) => /^172\.(1[6-9]|2\d|3[01])\./.test(address)) ||
    addresses.find((address) => address.startsWith("10.")) ||
    ""
  );
}
