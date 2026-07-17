import http from "node:http";
import path from "node:path";
import { buildEpubFromTabs } from "../src/build.js";
import { loadConfig } from "../src/config.js";

const pages = new Map([
  ["/article-one", samplePage("A Practical Reading Queue", [
    "This sample article has enough plain text for Readability to extract a normal chapter.",
    "The goal is to prove the EPUB builder without depending on an external website.",
    "Kobo readers handle simple headings, paragraphs, and links best, so this sample keeps the layout direct."
  ])],
  ["/article-two", samplePage("A Second Saved Tab", [
    "The second page checks that original tab order becomes chapter order.",
    "It also includes a link to make sure sanitized anchors survive the EPUB conversion.",
    "The generated file can be opened in Calibre or another EPUB reader for a quick manual check."
  ], '<p><a href="https://example.com/reference">Reference link</a></p>')]
]);

const server = http.createServer((req, res) => {
  const body = pages.get(req.url || "/");
  if (!body) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const config = loadConfig();
  const result = await buildEpubFromTabs({
    title: "Sample Saved Tabs",
    tabs: [
      { title: "A Practical Reading Queue", url: `${baseUrl}/article-one` },
      { title: "A Second Saved Tab", url: `${baseUrl}/article-two` }
    ],
    config: {
      ...config,
      outputDir: path.join(config.projectRoot, "output", "samples"),
      allowPrivateNetworkSources: true
    }
  });

  console.log(`Created sample EPUB: ${result.path}`);
  console.log(`Included chapters: ${result.included}`);
  console.log(`Failed chapters: ${result.failed}`);
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function samplePage(title, paragraphs, extraHtml = "") {
  const body = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
  </head>
  <body>
    <main>
      <article>
        <h1>${title}</h1>
        ${body}
        ${extraHtml}
      </article>
    </main>
  </body>
</html>`;
}
