import express from "express";
import { buildEpubFromTabs } from "./build.js";
import { isOriginAllowed } from "./config.js";
import { listEpubFiles, renderLibraryPage, sendEpubFile } from "./library.js";

export const appVersion = "1.0.0";

export function createApp(config) {
  const app = express();
  let buildInProgress = false;

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(corsForLocalExtension(config));
  app.use(localOnlyForProtectedRoutes);
  app.use(express.json({ limit: "256kb", strict: true }));

  app.get("/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, version: appVersion, syncTarget: config.syncTarget });
  });

  app.get("/config", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      version: appVersion,
      syncTarget: config.syncTarget,
      defaultBookTitle: config.defaultBookTitle,
      maxTabs: config.maxTabs
    });
  });

  app.get("/library", async (_req, res) => {
    try {
      const files = await listEpubFiles(config.outputDir);
      res.setHeader("Cache-Control", "no-store");
      res.type("html").send(renderLibraryPage(files));
    } catch (error) {
      console.error(error);
      res.status(500).type("text").send("Could not load EPUB library");
    }
  });

  app.get("/download/:filename", async (req, res) => {
    await sendEpubFile(req, res, config.outputDir);
  });

  app.post("/build-epub", async (req, res) => {
    if (buildInProgress) {
      res.status(409).json({ ok: false, error: "An EPUB is already being created" });
      return;
    }

    buildInProgress = true;
    try {
      const result = await buildEpubFromTabs({
        title: req.body?.title,
        tabs: req.body?.tabs,
        config
      });

      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        filename: result.filename,
        included: result.included,
        failed: result.failed,
        syncTarget: config.syncTarget,
        skippedUnsupported: result.skippedUnsupported,
        skippedByLimit: result.skippedByLimit,
        results: result.results
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        console.error(error);
      }

      res.status(statusCode).json({
        ok: false,
        error: statusCode >= 500 ? "Could not create the EPUB" : error.message
      });
    } finally {
      buildInProgress = false;
    }
  });

  app.use((error, _req, res, _next) => {
    const isBadJson = error instanceof SyntaxError || error?.type === "entity.too.large";
    if (!isBadJson) {
      console.error(error);
    }

    res.status(isBadJson ? 400 : 500).json({
      ok: false,
      error: isBadJson ? "Request body must be valid JSON under 256 KB" : "Unexpected server error"
    });
  });

  return app;
}

export function listenHosts(host) {
  if (host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0") {
    return [host];
  }

  return [host, "127.0.0.1"];
}

export function isLoopbackAddress(address = "") {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address.startsWith("::ffff:127.")
  );
}

function securityHeaders(_req, res, next) {
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
}

function corsForLocalExtension(serverConfig) {
  return (req, res, next) => {
    const origin = req.get("origin");
    const allowed = isOriginAllowed(origin, serverConfig);

    if (allowed && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

      if (req.get("access-control-request-private-network") === "true") {
        res.setHeader("Access-Control-Allow-Private-Network", "true");
      }
    }

    if (req.method === "OPTIONS") {
      if (!allowed) {
        res.status(403).json({ ok: false, error: "Origin is not allowed" });
        return;
      }

      res.status(204).end();
      return;
    }

    if (!allowed) {
      res.status(403).json({ ok: false, error: "Origin is not allowed" });
      return;
    }

    next();
  };
}

function localOnlyForProtectedRoutes(req, res, next) {
  const protectedRoutes = new Set(["/build-epub", "/config"]);
  if (!protectedRoutes.has(req.path)) {
    next();
    return;
  }

  if (isLoopbackAddress(req.socket.remoteAddress)) {
    next();
    return;
  }

  res.status(403).json({ ok: false, error: "This endpoint is only available from this computer" });
}
