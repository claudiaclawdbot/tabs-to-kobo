import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import sanitizeHtml from "sanitize-html";
import http from "node:http";
import https from "node:https";
import { resolveSafeHttpTarget } from "./network.js";

const supportedProtocols = new Set(["http:", "https:"]);

const allowedTags = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "li",
  "pre",
  "code",
  "em",
  "strong",
  "b",
  "i",
  "a",
  "br",
  "hr"
];

export function isSupportedUrl(value) {
  try {
    const parsed = new URL(value);
    return supportedProtocols.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function normalizeTab(tab) {
  const url = typeof tab?.url === "string" ? tab.url.trim().slice(0, 8192) : "";
  const title = typeof tab?.title === "string" ? tab.title.trim().slice(0, 300) : "";

  return {
    title: title || url || "Untitled page",
    url
  };
}

export function sanitizeReadableHtml(html) {
  return sanitizeHtml(html || "", {
    allowedTags,
    allowedAttributes: {
      a: ["href", "title"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
    textFilter: (text) => text.replace(/\u00a0/g, " ")
  }).trim();
}

export function textToParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("\n");
}

export function makeFallbackChapter(tab, reason = "Extraction failed") {
  const normalized = normalizeTab(tab);

  return {
    title: normalized.title,
    url: normalized.url,
    success: false,
    error: reason,
    contentHtml: [
      "<p>Could not extract this page automatically.</p>",
      `<p>Reason: ${escapeHtml(reason)}</p>`
    ].join("\n")
  };
}

export async function extractArticle(tab, options = {}) {
  const normalized = normalizeTab(tab);

  if (!isSupportedUrl(normalized.url)) {
    throw new Error("Unsupported URL");
  }

  const html = await fetchHtml(normalized.url, options);
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, {
    url: normalized.url,
    virtualConsole
  });

  const article = new Readability(dom.window.document).parse();

  if (!article) {
    throw new Error("Readability could not find article content");
  }

  const sanitizedContent = sanitizeReadableHtml(article.content);
  const fallbackContent = textToParagraphs(article.textContent);
  const contentHtml = sanitizedContent || fallbackContent;

  if (!contentHtml.trim()) {
    throw new Error("No readable content found");
  }

  return {
    title: cleanTitle(article.title || normalized.title),
    url: normalized.url,
    byline: article.byline || "",
    excerpt: article.excerpt || "",
    success: true,
    contentHtml
  };
}

export async function fetchHtml(url, options = {}) {
  const maxRedirects = boundedInteger(options.maxRedirects, 5, 0, 10);
  let currentUrl = url;

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const target = await resolveSafeHttpTarget(currentUrl, options);
    const result = await requestTarget(target, options);

    if (!result.redirect) {
      return result.html;
    }

    if (redirects === maxRedirects) {
      throw new Error("Page redirected too many times");
    }

    currentUrl = new URL(result.redirect, target.url).href;
  }

  throw new Error("Page redirected too many times");
}

function requestTarget(target, options) {
  const timeoutMs = boundedInteger(options.timeoutMs, 15000, 1000, 60000);
  const maxBytes = boundedInteger(options.maxBytes, 5 * 1024 * 1024, 1024, 20 * 1024 * 1024);
  const transport = target.url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      callback(value);
    };

    const request = transport.request(target.url, {
      method: "GET",
      family: target.family,
      lookup: (_hostname, _lookupOptions, callback) => callback(null, target.address, target.family),
      headers: {
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "Mozilla/5.0 TabsToKobo/1.0"
      }
    }, (response) => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        finish(resolve, { redirect: location });
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        finish(reject, new Error(`Fetch failed with HTTP ${statusCode || "unknown"}`));
        return;
      }

      const contentType = String(response.headers["content-type"] || "");
      if (!isHtmlContentType(contentType)) {
        response.resume();
        finish(reject, new Error(`Unsupported content type: ${contentType || "unknown"}`));
        return;
      }

      const contentLength = Number.parseInt(String(response.headers["content-length"] || ""), 10);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        response.resume();
        finish(reject, new Error("Page is too large to save safely"));
        return;
      }

      const chunks = [];
      let received = 0;

      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
          const error = new Error("Page is too large to save safely");
          error.code = "PAGE_TOO_LARGE";
          response.destroy(error);
          return;
        }

        chunks.push(chunk);
      });

      response.on("error", (error) => {
        const message = error.code === "PAGE_TOO_LARGE" || error.message === "Page is too large to save safely"
          ? error.message
          : "Could not read the page response";
        finish(reject, new Error(message));
      });

      response.on("end", () => {
        const html = Buffer.concat(chunks).toString("utf8");
        if (!html.trim()) {
          finish(reject, new Error("Fetched page was empty"));
          return;
        }

        finish(resolve, { html });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Page request timed out"));
    });

    request.on("error", (error) => {
      const knownMessage = error.code === "PAGE_TOO_LARGE" || error.message === "Page request timed out";
      const message = knownMessage ? error.message : "Could not connect to the page";
      finish(reject, new Error(message));
    });

    request.end();
  });
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, parsed));
}

function isHtmlContentType(contentType) {
  return (
    !contentType ||
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml")
  );
}

function cleanTitle(value) {
  return String(value || "Untitled page")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
