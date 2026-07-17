import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { createEpub, toXhtmlFragment } from "../src/epub.js";

test("createEpub writes a readable EPUB package", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "kobo-tab-syncer-"));
  const result = await createEpub({
    title: "Test Saved Tabs",
    generatedAt: new Date("2026-06-28T14:30:00-04:00"),
    outputDir,
    chapters: [
      {
        title: "Example Chapter",
        url: "https://example.com/article",
        success: true,
        contentHtml: "<p>Hello <strong>reader</strong>.</p>"
      }
    ]
  });

  const buffer = await fs.readFile(result.path);
  const zip = await JSZip.loadAsync(buffer);
  const mimetype = await zip.file("mimetype").async("string");
  const chapter = await zip.file("OEBPS/chapter-1.xhtml").async("string");
  const opf = await zip.file("OEBPS/content.opf").async("string");

  assert.equal(mimetype, "application/epub+zip");
  assert.equal(Object.keys(zip.files)[0], "mimetype");
  assert.match(opf, /Test Saved Tabs/);
  assert.match(chapter, /Example Chapter/);
  assert.match(chapter, /https:\/\/example.com\/article/);
});

test("toXhtmlFragment removes scripts and unsafe attributes", () => {
  const result = toXhtmlFragment([
    '<script>alert("no")</script>',
    '<p onclick="alert(1)">Keep <strong data-extra="x">this</strong>.</p>',
    '<a href="javascript:alert(1)">Unsafe link</a>'
  ].join(""));

  assert.doesNotMatch(result, /script|onclick|javascript|data-extra/i);
  assert.match(result, /<p>Keep <strong>this<\/strong>\.<\/p>/);
  assert.match(result, /<a>Unsafe link<\/a>/);
});
