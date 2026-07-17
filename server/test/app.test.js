import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp, isLoopbackAddress, listenHosts } from "../src/app.js";
import { renderLibraryPage } from "../src/library.js";

test("protected companion routes allow the extension origin and reject web origins", async (t) => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "tabs-to-kobo-app-"));
  const config = {
    outputDir,
    syncTarget: "local",
    host: "127.0.0.1",
    port: 3217,
    defaultBookTitle: "Saved Tabs",
    maxTabs: 50,
    fetchTimeoutMs: 15000,
    maxPageBytes: 5 * 1024 * 1024,
    maxRedirects: 5,
    allowPrivateNetworkSources: false,
    allowedOrigins: ["chrome-extension://", "http://127.0.0.1", "http://localhost"]
  };
  const server = createApp(config).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const allowed = await fetch(`${baseUrl}/config`, {
    headers: { Origin: "chrome-extension://example-id" }
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "chrome-extension://example-id");

  const rejected = await fetch(`${baseUrl}/config`, {
    headers: { Origin: "https://example.com" }
  });
  assert.equal(rejected.status, 403);

  const badBody = await fetch(`${baseUrl}/build-epub`, {
    method: "POST",
    headers: {
      Origin: "chrome-extension://example-id",
      "Content-Type": "application/json"
    },
    body: "not-json"
  });
  assert.equal(badBody.status, 400);
});

test("config includes library URLs for the extension", async (t) => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "tabs-to-kobo-config-"));
  const server = createApp({
    outputDir,
    syncTarget: "wifi",
    host: "192.168.1.25",
    port: 3217,
    defaultBookTitle: "Saved Tabs",
    maxTabs: 50,
    fetchTimeoutMs: 15000,
    maxPageBytes: 5 * 1024 * 1024,
    maxRedirects: 5,
    allowPrivateNetworkSources: false,
    allowedOrigins: ["chrome-extension://", "http://127.0.0.1", "http://localhost"]
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/config`);
  const body = await response.json();

  assert.equal(body.localLibraryUrl, "http://127.0.0.1:3217/library");
  assert.equal(body.koboLibraryUrl, "http://192.168.1.25:3217/library");
});

test("network and library helpers keep the intended local boundary", () => {
  assert.deepEqual(listenHosts("192.168.1.25"), ["192.168.1.25", "127.0.0.1"]);
  assert.deepEqual(listenHosts("127.0.0.1"), ["127.0.0.1"]);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("192.168.1.25"), false);

  const html = renderLibraryPage([
    { name: "reading.epub", size: 2048, modifiedAt: new Date("2026-07-17T12:00:00Z") }
  ]);
  assert.match(html, /reading\.epub/);
  assert.doesNotMatch(html, /Output folder|\/Users\//);
});
