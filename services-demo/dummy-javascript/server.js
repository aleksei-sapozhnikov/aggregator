/*
 * Dummy JavaScript service used to simulate a simple service health endpoint.
 *
 * Exposes the following HTTP endpoints:
 *   - /health
 *       Returns the current health status ("UP" or "DOWN")
 *
 *   - /set-health/{UP|DOWN}
 *       Updates the health status returned by /health
 *
 * Intended for testing and demonstration purposes.
 */

const http = require("http");
const { URL } = require("url");

const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const shouldLog = (level) => LEVELS[level] <= (LEVELS[LOG_LEVEL] ?? LEVELS.info);

const log = {
  error: (...args) => shouldLog("error") && console.error(new Date().toISOString(), "ERROR", ...args),
  warn: (...args) => shouldLog("warn") && console.warn(new Date().toISOString(), "WARN", ...args),
  info: (...args) => shouldLog("info") && console.log(new Date().toISOString(), "INFO", ...args),
  debug: (...args) => shouldLog("debug") && console.log(new Date().toISOString(), "DEBUG", ...args),
};

let status = "UP";

const statusPayload = () => `{
  "status": "${status}"
}`;

const sendJson = (res, code, payload) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(payload);
};

const sendText = (res, code, message) => {
  res.writeHead(code, { "Content-Type": "text/plain" });
  res.end(message);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname; // e.g. /set-health/up

  if (path === "/health") {
    if (req.method !== "GET") {
      sendText(res, 405, "Method Not Allowed");
      log.warn(`${req.method} ${path} -> 405`);
      return;
    }
    sendJson(res, 200, statusPayload());
    log.info(`GET /health -> ${status}`);
    return;
  }

  if (path.startsWith("/set-health")) {
    if (req.method !== "GET") {
      sendText(res, 405, "Only GET method allowed");
      log.warn(`${req.method} ${path} -> 405`);
      return;
    }

    const parts = path.split("/").filter(Boolean); // ["set-health", "up"]
    if (parts.length !== 2) {
      sendText(res, 400, "Expected /set-health/up or /set-health/down");
      log.warn(`GET ${path} -> 400 (bad path)`);
      return;
    }

    const normalized = parts[1].trim().toUpperCase();
    if (!["UP", "DOWN"].includes(normalized)) {
      sendText(res, 400, "value must be up or down");
      log.warn(`GET ${path} -> 400 (bad value: ${parts[1]})`);
      return;
    }

    status = normalized;
    sendJson(res, 200, statusPayload());
    log.info(`GET ${path} -> ${status}`);
    return;
  }

  sendText(res, 404, "Not Found");
  log.warn(`${req.method} ${path} -> 404`);
});

server.listen(8080, "0.0.0.0", () => {
  log.info("Dummy service listening on 8080");
});
