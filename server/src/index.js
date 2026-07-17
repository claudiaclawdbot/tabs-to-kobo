import { createApp, listenHosts } from "./app.js";
import { loadConfig } from "./config.js";
import { getLanLibraryUrls } from "./library.js";

const config = loadConfig();
const app = createApp(config);

for (const host of listenHosts(config.host)) {
  app.listen(config.port, host, () => {
    console.log(`Tabs to Kobo companion listening on http://${host}:${config.port}`);

    if (host === "127.0.0.1") {
      console.log(`Local EPUB library: http://127.0.0.1:${config.port}/library`);
    }

    if (config.syncTarget === "wifi" && host !== "127.0.0.1") {
      console.log(`Kobo library: http://${host}:${config.port}/library`);
    } else if (config.host === "0.0.0.0") {
      const lanUrls = getLanLibraryUrls(config.port);
      if (lanUrls.length > 0) {
        console.log("Kobo library URLs:");
        for (const url of lanUrls) {
          console.log(`  ${url}`);
        }
      } else {
        console.log("No Wi-Fi network address was found.");
      }
    }
  });
}
