import { createEpub } from "./epub.js";
import { extractArticle, isSupportedUrl, makeFallbackChapter, normalizeTab } from "./extract.js";

export async function buildEpubFromTabs({ title, tabs, config, now = new Date() }) {
  if (!config) {
    throw clientError("Server config is required");
  }

  if (!Array.isArray(tabs)) {
    throw clientError("Request body must include a tabs array");
  }

  const maxTabs = Math.max(1, Number(config.maxTabs) || 50);
  const normalizedTabs = tabs.map(normalizeTab);
  const supportedTabs = normalizedTabs.filter((tab) => isSupportedUrl(tab.url));
  const limitedTabs = supportedTabs.slice(0, maxTabs);

  if (limitedTabs.length === 0) {
    throw clientError("No supported web tabs were provided");
  }

  const chapters = [];
  const results = [];

  for (const tab of limitedTabs) {
    try {
      const chapter = await extractArticle(tab, {
        timeoutMs: config.fetchTimeoutMs,
        maxBytes: config.maxPageBytes,
        maxRedirects: config.maxRedirects,
        allowPrivateNetworkSources: config.allowPrivateNetworkSources
      });
      chapters.push(chapter);
      results.push({
        title: chapter.title,
        url: chapter.url,
        success: true
      });
    } catch (error) {
      const message = error?.message || "Extraction failed";
      if (config.includeFailedPages !== false) {
        chapters.push(makeFallbackChapter(tab, message));
      }

      results.push({
        title: tab.title,
        url: tab.url,
        success: false,
        error: message
      });
    }
  }

  if (chapters.length === 0) {
    throw clientError("No chapters could be created");
  }

  const failed = results.filter((result) => !result.success).length;
  const bookTitle = cleanBookTitle(title) || config.defaultBookTitle || "Saved Tabs";

  const epub = await createEpub({
    title: bookTitle,
    generatedAt: now,
    chapters,
    outputDir: config.outputDir,
    failedCount: failed,
    skippedUnsupported: normalizedTabs.length - supportedTabs.length
  });

  return {
    ...epub,
    requested: normalizedTabs.length,
    supported: supportedTabs.length,
    included: chapters.length,
    failed,
    skippedUnsupported: normalizedTabs.length - supportedTabs.length,
    skippedByLimit: Math.max(0, supportedTabs.length - limitedTabs.length),
    results
  };
}

function cleanBookTitle(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function clientError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
