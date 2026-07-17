const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const requiredFiles = [
  "README.md",
  "docs/index.html",
  "docs/styles.css",
  "docs/.nojekyll",
  ".github/workflows/pages.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/PULL_REQUEST_TEMPLATE.md"
];

for (const file of requiredFiles) {
  const filePath = path.join(projectRoot, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required repo-facing file: ${file}`);
  }
}

const filesToScan = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/index.html",
  "docs/styles.css",
  "extension/popup.html",
  "extension/popup.js",
  "extension/styles.css",
  "macos/README.md"
];

for (const file of filesToScan) {
  const contents = fs.readFileSync(path.join(projectRoot, file), "utf8");
  if (/[—–]/.test(contents)) {
    throw new Error(`Found an em dash or en dash in ${file}`);
  }
}

const index = fs.readFileSync(path.join(projectRoot, "docs/index.html"), "utf8");
if (!index.includes('href="styles.css"')) {
  throw new Error("docs/index.html must link docs/styles.css");
}

console.log("Checked repository docs and Pages files.");
