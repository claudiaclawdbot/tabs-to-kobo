import dns from "node:dns/promises";
import net from "node:net";

const blockedHostnameSuffixes = [".localhost", ".local", ".internal", ".home.arpa"];

export async function resolveSafeHttpTarget(value, options = {}) {
  const url = parseHttpUrl(value);

  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not supported");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || hostname === "localhost" || blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    if (!options.allowPrivateNetworkSources) {
      throw new Error("Private or local network pages are blocked");
    }
  }

  const lookup = options.lookup || dns.lookup;
  let addresses;

  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve the page host");
  }

  const normalized = normalizeLookupResults(addresses);
  if (normalized.length === 0) {
    throw new Error("Could not resolve the page host");
  }

  if (!options.allowPrivateNetworkSources && normalized.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("Private or local network pages are blocked");
  }

  const preferred = normalized.find((entry) => entry.family === 4) || normalized[0];
  return { url, address: preferred.address, family: preferred.family };
}

export function parseHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid page URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS pages are supported");
  }

  return url;
}

export function isPublicAddress(value) {
  const address = normalizeHostname(value);
  const family = net.isIP(address);

  if (family === 4) {
    return isPublicIpv4(address);
  }

  if (family === 6) {
    return isPublicIpv6(address);
  }

  return false;
}

function normalizeLookupResults(results) {
  const values = Array.isArray(results) ? results : [results];
  const seen = new Set();
  const normalized = [];

  for (const value of values) {
    const address = typeof value === "string" ? value : value?.address;
    const family = Number(typeof value === "string" ? net.isIP(value) : value?.family || net.isIP(address));
    const key = `${family}:${address}`;
    if (!address || ![4, 6].includes(family) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({ address, family });
  }

  return normalized;
}

function isPublicIpv4(value) {
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIpv6(value) {
  const bytes = ipv6ToBytes(value);
  if (!bytes) {
    return false;
  }

  const isIpv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isIpv4Mapped) {
    return isPublicIpv4(bytes.slice(12).join("."));
  }

  const isGlobalUnicast = bytes[0] >= 0x20 && bytes[0] <= 0x3f;
  const isDocumentation = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8;
  return isGlobalUnicast && !isDocumentation;
}

function ipv6ToBytes(value) {
  const withoutZone = value.toLowerCase().split("%")[0];
  if ((withoutZone.match(/::/g) || []).length > 1) {
    return null;
  }

  const [leftRaw, rightRaw = ""] = withoutZone.split("::");
  const left = parseIpv6Side(leftRaw);
  const right = parseIpv6Side(rightRaw);
  if (!left || !right) {
    return null;
  }

  const missing = 8 - left.length - right.length;
  if ((withoutZone.includes("::") && missing < 1) || (!withoutZone.includes("::") && missing !== 0)) {
    return null;
  }

  const groups = [...left, ...Array(Math.max(0, missing)).fill(0), ...right];
  if (groups.length !== 8) {
    return null;
  }

  return groups.flatMap((group) => [group >> 8, group & 0xff]);
}

function parseIpv6Side(side) {
  if (!side) {
    return [];
  }

  const groups = [];
  for (const token of side.split(":")) {
    if (token.includes(".")) {
      const octets = token.split(".").map(Number);
      if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return null;
      }

      groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(token)) {
      return null;
    }

    groups.push(Number.parseInt(token, 16));
  }

  return groups;
}

function normalizeHostname(value) {
  return String(value || "").replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}
