import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptRoot, "..", "..");
const extensionRoot = path.join(projectRoot, "extension");
const distRoot = path.join(projectRoot, "dist");
const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(extensionRoot, "manifest.json"), "utf8"));
const extensionFiles = ["manifest.json", "popup.html", "popup.js", "styles.css"];

if (manifest.version !== packageJson.version) {
  throw new Error(`Extension version ${manifest.version} does not match package version ${packageJson.version}`);
}

const zip = new JSZip();
for (const filename of extensionFiles) {
  zip.file(filename, await fs.readFile(path.join(extensionRoot, filename)), {
    date: new Date("2020-01-01T00:00:00.000Z")
  });
}

const output = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 }
});

await fs.mkdir(distRoot, { recursive: true });
const outputPath = path.join(distRoot, `tabs-to-kobo-extension-v${packageJson.version}.zip`);
await fs.writeFile(outputPath, output);
console.log(`Created ${outputPath}`);
