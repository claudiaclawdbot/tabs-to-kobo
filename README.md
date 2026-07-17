# Tabs to Kobo

Turn the readable pages in one Chrome window into a single Kobo-ready EPUB.

Tabs to Kobo is local-first: a small browser extension sends tab titles and URLs to a companion running on your computer. The companion fetches the public article pages, removes page chrome and scripts, builds an EPUB, and gives your Kobo a simple same-Wi-Fi download page. There is no account, hosted backend, analytics, or automatic cloud upload.

Project site: [claudiaclawdbot.github.io/tabs-to-kobo](https://claudiaclawdbot.github.io/tabs-to-kobo/)

## Why this is an extension, not a bookmarklet

A bookmarklet can see only the page it is running on. It cannot safely read the other tabs in a browser window. The extension is what makes the useful one-click workflow possible without opening a localhost endpoint to arbitrary websites.

## What you need

- Node.js 20 or newer
- Chrome, Chromium, Brave, or Edge
- A Kobo with its web browser enabled for same-Wi-Fi downloads
- macOS, Linux, or Windows for the companion; the optional login service is currently macOS-only

## Five-minute setup

Clone the project and install the locked dependencies:

```sh
git clone https://github.com/claudiaclawdbot/tabs-to-kobo.git
cd tabs-to-kobo
npm run setup
```

On macOS, you can also double-click:

```txt
macos/Install Tabs to Kobo.command
```

Start same-Wi-Fi mode:

```sh
npm run start:wifi
```

Keep that terminal open. It prints two useful addresses:

- `http://127.0.0.1:3217/library` for this computer
- an address like `http://192.168.1.23:3217/library` for the Kobo

Load the extension:

1. Open `chrome://extensions` (or your Chromium browser's extension page).
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Choose this project's `extension` folder.
5. Pin **Tabs to Kobo**.

Create and download a book:

1. Put the articles you want in one browser window, in reading order.
2. Click **Tabs to Kobo**, then **Create EPUB from this window**.
3. On the Kobo, open its web browser and visit the Wi-Fi library address printed by the companion.
4. Tap the newest EPUB. Kobo should download and import it into **My Books**.

The [latest GitHub release](https://github.com/claudiaclawdbot/tabs-to-kobo/releases/latest) also includes a ready-to-unzip extension package. The local companion is still required.

## Keep it running on macOS

For a guided restart window, double-click:

```txt
macos/Restart Tabs to Kobo.command
```

Install the companion as a per-user login service:

```sh
npm run service:install
```

Useful service commands:

```sh
npm run service:status
npm run service:restart
npm run service:uninstall
```

The service starts at login, restarts after a crash, and writes logs under `~/Library/Logs/tabs-to-kobo/`.

The Chrome popup also shows a **Copy Kobo URL** button when the companion is running in same-Wi-Fi mode.

## Optional cloud-folder output

If your Kobo model exposes Google Drive or Dropbox, the companion can write directly into the desktop sync folder instead of using its Wi-Fi library.

For Google Drive:

```sh
npm run configure:google-drive
npm start
```

For Dropbox:

```sh
npm run configure:dropbox
npm start
```

The setup script writes the chosen path to the ignored `server/config.local.json` file. Account credentials never enter this project.

## Privacy and security model

- EPUBs and extracted article text stay in your selected local folder unless that folder is managed by a sync provider you configured.
- The companion contacts each source website directly, without your browser cookies. Paywalled or signed-in pages usually become link-only fallback chapters.
- Only loopback requests can read companion configuration or trigger EPUB builds.
- In Wi-Fi mode, other devices on the same LAN can list and download generated EPUBs, but cannot create new ones.
- Source URLs that resolve to loopback, private, link-local, multicast, or reserved IP space are blocked by default. Redirects are checked again before following them.
- Each page has a timeout and a 5 MB response limit. Request bodies and concurrent builds are also bounded.
- The extension has one permission: access to tab titles and URLs. It has no content scripts, browsing-history permission, remote code, analytics, or account access.

Use the Wi-Fi library only on a network whose other users you trust. See [SECURITY.md](SECURITY.md) for reporting and deployment details.

## Configuration

Copy the example only when you need to change defaults:

```sh
cp server/config.example.json server/config.local.json
```

Key settings:

| Setting | Default | Purpose |
| --- | ---: | --- |
| `port` | `3217` | Companion port |
| `outputDir` | `output` | EPUB destination, relative to the project root or absolute |
| `defaultBookTitle` | `Saved Tabs` | EPUB title |
| `maxTabs` | `50` | Maximum pages in one build |
| `fetchTimeoutMs` | `15000` | Per-page timeout |
| `maxPageBytes` | `5242880` | Maximum response size per page |
| `maxRedirects` | `5` | Redirect limit per page |
| `allowPrivateNetworkSources` | `false` | Permit fetching intranet or localhost pages |

Environment variables are also supported: `PORT`, `HOST`, `OUTPUT_DIR`, `SYNC_TARGET`, `DEFAULT_BOOK_TITLE`, `MAX_TABS`, `FETCH_TIMEOUT_MS`, `MAX_PAGE_BYTES`, `MAX_REDIRECTS`, `ALLOW_PRIVATE_NETWORK_SOURCES`, and `KOBO_TAB_SYNCER_CONFIG`.

Enabling private-network sources weakens the companion's server-side request-forgery protection. Leave it off unless you understand the tradeoff and specifically need intranet pages.

If you change the port, update both URLs in `extension/popup.js` and the host permissions in `extension/manifest.json`.

## Development

Run the complete local check:

```sh
npm run check
```

Create a deterministic extension release asset:

```sh
npm run package:extension
```

The ZIP is written to `dist/`. Generated EPUBs, local configuration, dependencies, logs, and release artifacts are ignored by Git.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## GitHub Pages

The public site lives in `docs/` and deploys through `.github/workflows/pages.yml`.

To publish it on GitHub:

1. Open the repository settings on GitHub.
2. Go to **Pages**.
3. Set **Build and deployment** to **GitHub Actions**.
4. Push to `main`, or run the **Pages** workflow manually.

GitHub's current custom workflow docs use `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v4`.

## License

[MIT](LICENSE)

Tabs to Kobo is an independent open-source project and is not affiliated with or endorsed by Rakuten Kobo.
