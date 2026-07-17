import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const voidTags = new Set(["br", "hr"]);
const allowedContentTags = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li",
  "pre", "code", "em", "strong", "b", "i", "a", "br", "hr"
]);
const allowedContentAttributes = new Map([
  ["a", new Set(["href", "title"])]
]);

export async function createEpub(options) {
  const generatedAt = options.generatedAt || new Date();
  const title = cleanText(options.title || "Saved Tabs");
  const chapters = normalizeChapters(options.chapters || []);
  const outputDir = options.outputDir;

  if (!outputDir) {
    throw new Error("Output directory is required");
  }

  if (chapters.length === 0) {
    throw new Error("At least one chapter is required");
  }

  await fs.mkdir(outputDir, { recursive: true });

  const filename = await nextAvailableFilename(outputDir, generatedAt);
  const filePath = path.join(outputDir, filename);
  const bookId = `urn:uuid:${crypto.randomUUID()}`;
  const modified = generatedAt.toISOString().replace(/\.\d{3}Z$/, "Z");

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", containerXml());
  zip.file("OEBPS/styles.css", stylesheet());
  zip.file("OEBPS/front.xhtml", frontPage({
    title,
    generatedAt,
    chapterCount: chapters.length,
    failedCount: options.failedCount || 0,
    skippedUnsupported: options.skippedUnsupported || 0
  }));
  zip.file("OEBPS/nav.xhtml", navPage(title, chapters));
  zip.file("OEBPS/toc.ncx", ncx({ title, bookId, chapters }));
  zip.file("OEBPS/content.opf", contentOpf({ title, bookId, modified, chapters }));

  chapters.forEach((chapter, index) => {
    zip.file(`OEBPS/${chapter.href}`, chapterPage(chapter, index));
  });

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    mimeType: "application/epub+zip"
  });

  const temporaryPath = path.join(outputDir, `.${filename}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryPath, buffer, { flag: "wx" });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }

  return {
    path: filePath,
    filename,
    title,
    chapterCount: chapters.length
  };
}

function normalizeChapters(chapters) {
  return chapters.map((chapter, index) => ({
    title: cleanText(chapter.title || `Chapter ${index + 1}`),
    url: cleanText(chapter.url || ""),
    contentHtml: chapter.contentHtml || "<p>Could not extract this page automatically.</p>",
    success: chapter.success !== false,
    error: chapter.error || "",
    href: `chapter-${index + 1}.xhtml`,
    id: `chapter-${index + 1}`
  }));
}

async function nextAvailableFilename(outputDir, generatedAt) {
  const base = `tabs-to-kobo-${formatTimestamp(generatedAt)}`;
  let suffix = "";
  let counter = 2;

  while (true) {
    const filename = `${base}${suffix}.epub`;
    try {
      await fs.access(path.join(outputDir, filename));
      suffix = `-${counter}`;
      counter += 1;
    } catch {
      return filename;
    }
  }
}

function containerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;
}

function contentOpf({ title, bookId, modified, chapters }) {
  const chapterItems = chapters
    .map((chapter) => `    <item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const spineItems = chapters
    .map((chapter) => `    <itemref idref="${chapter.id}"/>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>Tabs to Kobo EPUB</dc:creator>
    <meta property="dcterms:modified">${escapeXml(modified)}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="style" href="styles.css" media-type="text/css"/>
    <item id="front" href="front.xhtml" media-type="application/xhtml+xml"/>
${chapterItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="front"/>
${spineItems}
  </spine>
</package>
`;
}

function ncx({ title, bookId, chapters }) {
  const chapterPoints = chapters
    .map((chapter, index) => {
      const playOrder = index + 2;
      return `    <navPoint id="${chapter.id}" playOrder="${playOrder}">
      <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
      <content src="${chapter.href}"/>
    </navPoint>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    <navPoint id="front" playOrder="1">
      <navLabel><text>Front Page</text></navLabel>
      <content src="front.xhtml"/>
    </navPoint>
${chapterPoints}
  </navMap>
</ncx>
`;
}

function navPage(title, chapters) {
  const items = chapters
    .map((chapter) => `      <li><a href="${chapter.href}">${escapeXml(chapter.title)}</a></li>`)
    .join("\n");

  return xhtmlDocument({
    title: "Table of Contents",
    body: `<nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
${items}
    </ol>
  </nav>`,
    extraHtmlAttrs: ' xmlns:epub="http://www.idpf.org/2007/ops"'
  });
}

function frontPage({ title, generatedAt, chapterCount, failedCount, skippedUnsupported }) {
  const failedLine = failedCount > 0 ? `<p>${failedCount} pages used fallback chapters.</p>` : "";
  const skippedLine = skippedUnsupported > 0 ? `<p>${skippedUnsupported} unsupported tabs were skipped.</p>` : "";

  return xhtmlDocument({
    title,
    body: `<section class="front">
    <h1>${escapeXml(title)}</h1>
    <p>Generated on ${escapeXml(formatDisplayDate(generatedAt))}</p>
    <p>${chapterCount} tabs included.</p>
    ${failedLine}
    ${skippedLine}
  </section>`
  });
}

function chapterPage(chapter, index) {
  const fallbackNotice = chapter.success
    ? ""
    : `<p class="notice">Could not extract this page automatically.</p>`;

  return xhtmlDocument({
    title: chapter.title,
    body: `<article>
    <h1>${escapeXml(chapter.title)}</h1>
    <p class="source">Source: ${sourceLink(chapter.url)}</p>
    ${fallbackNotice}
    <section class="content">
${toXhtmlFragment(chapter.contentHtml)}
    </section>
  </article>`,
    bodyClass: `chapter chapter-${index + 1}`
  });
}

function sourceLink(url) {
  if (!url) {
    return "No source URL";
  }

  return `<a href="${escapeAttribute(url)}">${escapeXml(url)}</a>`;
}

function xhtmlDocument({ title, body, bodyClass = "", extraHtmlAttrs = "" }) {
  const classAttr = bodyClass ? ` class="${escapeAttribute(bodyClass)}"` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"${extraHtmlAttrs}>
<head>
  <title>${escapeXml(title)}</title>
  <meta charset="utf-8"/>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body${classAttr}>
${body}
</body>
</html>
`;
}

function stylesheet() {
  return `body {
  color: #111;
  font-family: serif;
  line-height: 1.45;
}

h1, h2, h3, h4, h5, h6 {
  line-height: 1.2;
}

a {
  color: #0645ad;
}

.source, .notice {
  color: #555;
  font-size: 0.9em;
}

blockquote {
  border-left: 0.2em solid #bbb;
  margin-left: 0;
  padding-left: 1em;
}

pre {
  white-space: pre-wrap;
}
`;
}

export function toXhtmlFragment(html) {
  const dom = new JSDOM(`<body>${html || ""}</body>`);
  return Array.from(dom.window.document.body.childNodes)
    .map((node) => serializeNode(node))
    .join("\n")
    .trim();
}

function serializeNode(node) {
  if (node.nodeType === node.TEXT_NODE) {
    return escapeXml(node.nodeValue || "");
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return "";
  }

  const tagName = node.tagName.toLowerCase();
  if (!allowedContentTags.has(tagName)) {
    if (tagName === "script" || tagName === "style") {
      return "";
    }

    return Array.from(node.childNodes).map((child) => serializeNode(child)).join("");
  }

  const attributes = serializeAttributes(node, tagName);

  if (voidTags.has(tagName)) {
    return `<${tagName}${attributes}/>`;
  }

  const children = Array.from(node.childNodes).map((child) => serializeNode(child)).join("");
  return `<${tagName}${attributes}>${children}</${tagName}>`;
}

function serializeAttributes(node, tagName) {
  const allowed = allowedContentAttributes.get(tagName);
  if (!allowed) {
    return "";
  }

  const attrs = [];
  for (const attribute of Array.from(node.attributes)) {
    const name = attribute.name.toLowerCase();
    if (!allowed.has(name)) {
      continue;
    }

    if (name === "href" && !isSafeHref(attribute.value)) {
      continue;
    }

    attrs.push(`${name}="${escapeAttribute(attribute.value)}"`);
  }

  return attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
}

function isSafeHref(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());

  return `${year}-${month}-${day}-${hour}${minute}`;
}

function formatDisplayDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeAttribute(value) {
  return escapeXml(value).replaceAll("\n", " ");
}
