import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";

const service = process.argv[2];
const customPath = process.argv[3];
const supportedServices = new Set(["google-drive", "dropbox"]);

if (!supportedServices.has(service)) {
  console.error("Usage: npm run configure:google-drive");
  console.error("   or: npm run configure:dropbox");
  console.error("Optional direct path:");
  console.error("   node scripts/configure-cloud-output.js google-drive \"/path/to/Rakuten Kobo\"");
  process.exit(1);
}

const config = loadConfig();
const targetPath = customPath ? path.resolve(customPath) : await findTargetPath(service);

if (!targetPath) {
  console.error(`Could not find a local ${serviceLabel(service)} folder.`);
  console.error("Install and sign in to the desktop sync app first, then run this again.");
  if (service === "google-drive") {
    console.error("Expected a path like ~/Library/CloudStorage/GoogleDrive-ACCOUNT/My Drive/Rakuten Kobo");
  } else {
    console.error("Expected a path like ~/Library/CloudStorage/Dropbox/Apps/Rakuten Kobo");
  }
  process.exit(1);
}

await fs.mkdir(targetPath, { recursive: true });

const configPath = path.join(config.serverRoot, "config.local.json");
const existing = await readJsonIfExists(configPath);
const nextConfig = {
  ...existing,
  outputDir: targetPath,
  syncTarget: service
};

await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);

console.log(`Configured EPUB output for ${serviceLabel(service)}:`);
console.log(targetPath);
console.log("Restart the backend for this to take effect.");

async function findTargetPath(targetService) {
  const home = os.homedir();

  if (targetService === "google-drive") {
    const roots = [
      ...(await expandCloudStorage(home, /^GoogleDrive-/)),
      path.join(home, "Google Drive"),
      "/Volumes/GoogleDrive"
    ];

    for (const root of roots) {
      const candidates = [
        path.join(root, "My Drive", "Rakuten Kobo"),
        path.join(root, "Rakuten Kobo")
      ];
      const found = await firstUsableTarget(candidates, [path.join(root, "My Drive"), root]);
      if (found) {
        return found;
      }
    }
  }

  if (targetService === "dropbox") {
    const roots = [
      path.join(home, "Library", "CloudStorage", "Dropbox"),
      path.join(home, "Dropbox")
    ];

    for (const root of roots) {
      const candidates = [path.join(root, "Apps", "Rakuten Kobo")];
      const found = await firstUsableTarget(candidates, [path.join(root, "Apps"), root]);
      if (found) {
        return found;
      }
    }
  }

  return "";
}

async function expandCloudStorage(home, pattern) {
  const parent = path.join(home, "Library", "CloudStorage");
  try {
    const entries = await fs.readdir(parent, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

async function firstUsableTarget(candidates, parents) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  for (const parent of parents) {
    if (await pathExists(parent)) {
      return candidates[0];
    }
  }

  return "";
}

async function pathExists(value) {
  try {
    await fs.access(value);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function serviceLabel(value) {
  return value === "google-drive" ? "Google Drive" : "Dropbox";
}
