const COMPANION_URL = "http://127.0.0.1:3217";
const BUILD_URL = `${COMPANION_URL}/build-epub`;
const CONFIG_URL = `${COMPANION_URL}/config`;
const LIBRARY_URL = `${COMPANION_URL}/library`;

const sendButton = document.querySelector("#send-button");
const libraryButton = document.querySelector("#library-button");
const statusEl = document.querySelector("#status");
let backendConfig = null;

function setStatus(message, kind = "idle") {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
}

function isSupportedTab(tab) {
  if (!tab.url) {
    return false;
  }

  try {
    const url = new URL(tab.url);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatSyncTarget(syncTarget) {
  if (syncTarget === "google-drive") {
    return "Google Drive";
  }

  if (syncTarget === "dropbox") {
    return "Dropbox";
  }

  if (syncTarget === "wifi") {
    return "your Wi-Fi library";
  }

  return "your local library";
}

function queryCurrentWindowTabs() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tabs);
    });
  });
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "The local companion returned an error.");
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The local companion did not respond.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function initialize() {
  try {
    const [config, allTabs] = await Promise.all([
      requestJson(CONFIG_URL),
      queryCurrentWindowTabs()
    ]);
    backendConfig = config;
    const count = allTabs.filter(isSupportedTab).length;
    setStatus(`${count} supported ${count === 1 ? "page" : "pages"} ready. Saves to ${formatSyncTarget(config.syncTarget)}.`);
  } catch {
    setStatus("Start the local companion with: npm run start:wifi", "error");
  }
}

async function sendTabs() {
  sendButton.disabled = true;
  setStatus("Collecting pages…");

  try {
    const allTabs = await queryCurrentWindowTabs();
    const tabs = allTabs.filter(isSupportedTab).map((tab) => ({
      title: tab.title || tab.url,
      url: tab.url
    }));

    if (tabs.length === 0) {
      setStatus("No regular web pages were found in this window.", "error");
      return;
    }

    setStatus(`Creating an EPUB from ${tabs.length} ${tabs.length === 1 ? "page" : "pages"}…`);
    const payload = await requestJson(BUILD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabs })
    });

    const fallbackText = payload.failed > 0
      ? ` ${payload.failed} ${payload.failed === 1 ? "page used" : "pages used"} a link-only fallback.`
      : "";
    setStatus(`Created ${payload.filename} with ${payload.included} ${payload.included === 1 ? "chapter" : "chapters"}.${fallbackText}`, "success");
  } catch (error) {
    setStatus(error.message || "Could not create the EPUB.", "error");
  } finally {
    sendButton.disabled = false;
  }
}

sendButton.addEventListener("click", sendTabs);
libraryButton.addEventListener("click", () => chrome.tabs.create({ url: LIBRARY_URL }));
initialize();
