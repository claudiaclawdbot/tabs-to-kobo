import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const action = process.argv[2];
const label = "dev.claudiaclawdbot.tabs-to-kobo";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const logDir = path.join(os.homedir(), "Library", "Logs", "tabs-to-kobo");
const guiTarget = `gui/${process.getuid()}`;
const serviceTarget = `${guiTarget}/${label}`;

if (!["install", "restart", "status", "uninstall"].includes(action)) {
  console.error("Usage: npm run service:install");
  console.error("   or: npm run service:restart");
  console.error("   or: npm run service:status");
  console.error("   or: npm run service:uninstall");
  process.exit(1);
}

if (action === "install") {
  await install();
} else if (action === "restart") {
  restart();
} else if (action === "status") {
  status();
} else {
  await uninstall();
}

async function install() {
  await fs.mkdir(path.dirname(plistPath), { recursive: true });
  await fs.mkdir(logDir, { recursive: true });
  await fs.writeFile(plistPath, plistXml(), "utf8");

  run("launchctl", ["bootout", guiTarget, plistPath], { allowFailure: true });
  run("launchctl", ["bootstrap", guiTarget, plistPath]);
  run("launchctl", ["kickstart", "-k", serviceTarget], { allowFailure: true });

  console.log(`Installed ${label}`);
  console.log(`LaunchAgent: ${plistPath}`);
  console.log(`Logs: ${logDir}`);
}

function restart() {
  run("launchctl", ["bootout", guiTarget, plistPath], { allowFailure: true });
  run("launchctl", ["bootstrap", guiTarget, plistPath]);
  run("launchctl", ["kickstart", "-k", serviceTarget], { allowFailure: true });
  console.log(`Restarted ${label}`);
}

async function uninstall() {
  run("launchctl", ["bootout", guiTarget, plistPath], { allowFailure: true });

  try {
    await fs.rm(plistPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  console.log(`Uninstalled ${label}`);
}

function status() {
  const result = run("launchctl", ["print", serviceTarget], { allowFailure: true, capture: true });

  if (result.status === 0) {
    process.stdout.write(result.stdout);
    return;
  }

  console.log(`${label} is not loaded.`);
}

function plistXml() {
  const nodePath = preferredNodePath();
  const scriptPath = path.join(serverRoot, "scripts", "start-wifi.js");
  const stdoutPath = path.join(logDir, "out.log");
  const stderrPath = path.join(logDir, "err.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(scriptPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(serverRoot)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>
`;
}

function preferredNodePath() {
  const candidates = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    process.execPath
  ];

  return candidates.find((candidate) => fsSync.existsSync(candidate)) || process.execPath;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8"
  });

  if (options.capture) {
    return result;
  }

  if (result.status !== 0 && !options.allowFailure) {
    const detail = result.stderr || result.stdout || `${command} failed`;
    throw new Error(detail.trim());
  }

  return result;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
