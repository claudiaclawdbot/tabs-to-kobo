import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function listEpubFiles(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".epub")) {
      continue;
    }

    const filePath = path.join(outputDir, entry.name);
    const stats = await fs.stat(filePath);
    files.push({
      name: entry.name,
      size: stats.size,
      modifiedAt: stats.mtime
    });
  }

  return files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
}

export async function sendEpubFile(req, res, outputDir) {
  const filename = path.basename(req.params.filename || "");
  if (!filename.toLowerCase().endsWith(".epub")) {
    res.status(404).send("Not found");
    return;
  }

  try {
    const resolvedOutput = await fs.realpath(outputDir);
    const filePath = await fs.realpath(path.join(resolvedOutput, filename));
    const stats = await fs.stat(filePath);

    if (!stats.isFile() || !filePath.startsWith(`${resolvedOutput}${path.sep}`)) {
      res.status(404).send("Not found");
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    await new Promise((resolve) => {
      res.download(filePath, filename, {
        headers: {
          "Content-Type": "application/epub+zip"
        }
      }, (error) => {
        if (error && !res.headersSent) {
          res.status(404).send("Not found");
        }
        resolve();
      });
    });
  } catch {
    if (!res.headersSent) {
      res.status(404).send("Not found");
    }
  }
}

export function renderLibraryPage(files) {
  const rows = files.length
    ? files.map((file) => fileRow(file)).join("\n")
    : "<p>No EPUB files have been created yet.</p>";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Tabs to Kobo Library</title>
    <style>
      :root {
        color-scheme: light;
      }

      body {
        margin: 0;
        padding: 24px 18px 40px;
        color: #111;
        background: #f6f1e8;
        font-family: Georgia, serif;
        line-height: 1.45;
      }

      main {
        max-width: 680px;
        margin: 0 auto;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }

      p {
        margin: 0 0 14px;
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li {
        margin: 0 0 16px;
        padding: 14px;
        border: 1px solid #cabfae;
        border-radius: 8px;
        background: #fffdf9;
      }

      a {
        display: block;
        color: #111;
        font-size: 18px;
        font-weight: bold;
        text-decoration: underline;
        overflow-wrap: anywhere;
      }

      small {
        display: block;
        margin-top: 4px;
        color: #555;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Tabs to Kobo</h1>
      <p>Tap an EPUB to download it to this Kobo.</p>
      <ul>
        ${rows}
      </ul>
    </main>
  </body>
</html>`;
}

export function getLanLibraryUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }

      urls.push(`http://${address.address}:${port}/library`);
    }
  }

  return urls;
}

function fileRow(file) {
  const href = `/download/${encodeURIComponent(file.name)}`;
  const modified = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(file.modifiedAt);

  return `<li>
    <a href="${href}">${escapeHtml(file.name)}</a>
    <small>${formatBytes(file.size)}. Created ${escapeHtml(modified)}.</small>
  </li>`;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
