import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { fetchHtml } from "../src/extract.js";
import { isPublicAddress, resolveSafeHttpTarget } from "../src/network.js";

test("isPublicAddress accepts public IPs and rejects private or special ranges", () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("127.0.0.1"), false);
  assert.equal(isPublicAddress("192.168.1.5"), false);
  assert.equal(isPublicAddress("169.254.2.3"), false);
  assert.equal(isPublicAddress("::1"), false);
  assert.equal(isPublicAddress("fc00::1"), false);
  assert.equal(isPublicAddress("::ffff:127.0.0.1"), false);
  assert.equal(isPublicAddress("2001:db8::1"), false);
});

test("resolveSafeHttpTarget rejects credentials and mixed public/private DNS answers", async () => {
  await assert.rejects(
    resolveSafeHttpTarget("https://user:pass@example.com"),
    /credentials/
  );

  await assert.rejects(
    resolveSafeHttpTarget("https://example.com", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 }
      ]
    }),
    /Private or local/
  );
});

test("fetchHtml follows checked redirects and enforces a response size limit", async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/article" });
      res.end();
      return;
    }

    if (req.url === "/large") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<p>${"x".repeat(2048)}</p>`);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<article><h1>Local test</h1><p>Readable.</p></article>");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  await assert.rejects(fetchHtml(`${baseUrl}/article`), /Private or local/);

  const html = await fetchHtml(`${baseUrl}/redirect`, {
    allowPrivateNetworkSources: true,
    maxRedirects: 2
  });
  assert.match(html, /Local test/);

  await assert.rejects(
    fetchHtml(`${baseUrl}/large`, {
      allowPrivateNetworkSources: true,
      maxBytes: 1024
    }),
    /too large/
  );
});
