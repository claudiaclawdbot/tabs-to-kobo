import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(serverRoot, "..");

const defaults = {
  host: "127.0.0.1",
  port: 3217,
  outputDir: "output",
  syncTarget: "local",
  defaultBookTitle: "Saved Tabs",
  includeFailedPages: true,
  maxTabs: 50,
  fetchTimeoutMs: 15000,
  maxPageBytes: 5 * 1024 * 1024,
  maxRedirects: 5,
  allowPrivateNetworkSources: false,
  allowedOrigins: ["chrome-extension://", "http://127.0.0.1", "http://localhost"]
};

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boolFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(raw.toLowerCase())) {
    return false;
  }

  return fallback;
}

function resolveOutputDir(outputDir) {
  return path.isAbsolute(outputDir) ? outputDir : path.resolve(projectRoot, outputDir);
}

export function loadConfig() {
  const configPath = process.env.KOBO_TAB_SYNCER_CONFIG || path.join(serverRoot, "config.local.json");
  const fileConfig = readJsonIfExists(configPath);

  const merged = {
    ...defaults,
    ...fileConfig,
    host: process.env.HOST || fileConfig.host || defaults.host,
    port: intFromEnv("PORT", fileConfig.port || defaults.port),
    outputDir: process.env.OUTPUT_DIR || fileConfig.outputDir || defaults.outputDir,
    syncTarget: process.env.SYNC_TARGET || fileConfig.syncTarget || defaults.syncTarget,
    defaultBookTitle: process.env.DEFAULT_BOOK_TITLE || fileConfig.defaultBookTitle || defaults.defaultBookTitle,
    maxTabs: intFromEnv("MAX_TABS", fileConfig.maxTabs || defaults.maxTabs),
    fetchTimeoutMs: intFromEnv("FETCH_TIMEOUT_MS", fileConfig.fetchTimeoutMs || defaults.fetchTimeoutMs),
    maxPageBytes: intFromEnv("MAX_PAGE_BYTES", fileConfig.maxPageBytes || defaults.maxPageBytes),
    maxRedirects: intFromEnv("MAX_REDIRECTS", fileConfig.maxRedirects || defaults.maxRedirects),
    allowPrivateNetworkSources: boolFromEnv(
      "ALLOW_PRIVATE_NETWORK_SOURCES",
      fileConfig.allowPrivateNetworkSources ?? defaults.allowPrivateNetworkSources
    )
  };

  return {
    ...merged,
    maxTabs: Math.min(100, merged.maxTabs),
    fetchTimeoutMs: Math.min(60000, merged.fetchTimeoutMs),
    maxPageBytes: Math.min(20 * 1024 * 1024, merged.maxPageBytes),
    maxRedirects: Math.min(10, merged.maxRedirects),
    outputDir: resolveOutputDir(merged.outputDir),
    projectRoot,
    serverRoot
  };
}

export function isOriginAllowed(origin, config) {
  if (!origin) {
    return true;
  }

  const allowedOrigins = Array.isArray(config.allowedOrigins) ? config.allowedOrigins : defaults.allowedOrigins;

  return allowedOrigins.some((allowed) => {
    if (allowed.endsWith("://")) {
      return origin.startsWith(allowed);
    }

    return origin === allowed || origin.startsWith(`${allowed}:`);
  });
}
