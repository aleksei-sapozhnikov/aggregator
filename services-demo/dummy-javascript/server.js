/*
 * Dummy JavaScript service used to simulate a simple service health endpoint.
 *
 * Exposes the following HTTP endpoints:
 *   - /health/{pointId}
 *       Returns the current health status ("UP" or "DOWN")
 *
 *   - /set-health/{pointId}/{UP|DOWN}
 *       Updates the health status returned by /health/{pointId}
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

const statuses = new Map();

const getStatus = (pointId) => statuses.get(pointId) || "UP";

const statusPayload = (pointId) => `{
  "status": "${getStatus(pointId)}"
}`;

const sendJson = (res, code, payload) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(payload);
};

const sendText = (res, code, message) => {
  res.writeHead(code, { "Content-Type": "text/plain" });
  res.end(message);
};

const parseHealthPointId = (path) => {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "health") {
    return {matched: false};
  }
  if (parts.length === 2) {
    return {matched: true, pointId: parts[1]};
  }
  return {matched: true, invalid: true};
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname; // e.g. /set-health/1/up

  const healthPath = parseHealthPointId(path);
  if (healthPath.matched) {
    if (req.method !== "GET") {
      sendText(res, 405, "Method Not Allowed");
      log.warn(`${req.method} ${path} -> 405`);
      return;
    }
    if (healthPath.invalid) {
      sendText(res, 404, "Not Found");
      log.warn(`${req.method} ${path} -> 404`);
      return;
    }
    sendJson(res, 200, statusPayload(healthPath.pointId));
    log.info(`GET ${path} -> ${getStatus(healthPath.pointId)}`);
    return;
  }

  if (path.startsWith("/set-health/")) {
    if (req.method !== "GET") {
      sendText(res, 405, "Only GET method allowed");
      log.warn(`${req.method} ${path} -> 405`);
      return;
    }

    const parts = path.split("/").filter(Boolean);
    let pointId;
    let stateValue;
    if (parts.length === 3) {
      pointId = parts[1];
      stateValue = parts[2];
    } else {
      sendText(
          res,
          400,
          "Expected /set-health/{pointId}/{up|down}",
      );
      log.warn(`GET ${path} -> 400 (bad path)`);
      return;
    }

    const normalized = stateValue.trim().toUpperCase();
    if (!["UP", "DOWN"].includes(normalized)) {
      sendText(res, 400, "value must be up or down");
      log.warn(`GET ${path} -> 400 (bad value: ${stateValue})`);
      return;
    }

    statuses.set(pointId, normalized);
    sendJson(res, 200, statusPayload(pointId));
    log.info(`GET ${path} -> ${normalized}`);
    return;
  }

  sendText(res, 404, "Not Found");
  log.warn(`${req.method} ${path} -> 404`);
});

server.listen(8080, "0.0.0.0", () => {
  log.info("Dummy service listening on 8080");
});
