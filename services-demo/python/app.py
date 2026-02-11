#
# Dummy Python service used to simulate a simple service health endpoint.
#
# Exposes the following HTTP endpoints:
#   - /health
#       Returns the current health status ("UP" or "DOWN")
#
#   - /set-health/{UP|DOWN}
#       Updates the health status returned by /health
#
# Intended for testing and demonstration purposes.
#

import logging
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("dummy-service")

STATUS = "UP"


def status_payload() -> str:
    return f"{{\n  \"status\": \"{STATUS}\"\n}}"


class DummyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._handle_request()

    def _handle_request(self):
        parsed = urlparse(self.path)

        if parsed.path == "/health":
            self._send_json(HTTPStatus.OK, status_payload())
            logger.info("GET /health -> %s", STATUS)
            return

        if parsed.path.startswith("/set-health"):
            self._handle_set_state(parsed.path)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def _handle_set_state(self, path: str):
        global STATUS

        parts = [p for p in path.split("/") if p]  # ["set-health", "up"]
        if len(parts) != 2:
            self.send_error(
                HTTPStatus.BAD_REQUEST,
                "Expected /set-health/up or /set-health/down",
            )
            return

        normalized = parts[1].strip().upper()
        if normalized not in {"UP", "DOWN"}:
            self.send_error(HTTPStatus.BAD_REQUEST, "value must be up or down")
            return

        STATUS = normalized
        self._send_json(HTTPStatus.OK, status_payload())
        logger.info("GET %s -> %s", path, STATUS)

    def _send_json(self, status: HTTPStatus, payload: str):
        body = payload.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Keep default access logs disabled (optional).
        return


def run() -> None:
    server = HTTPServer(("0.0.0.0", 8080), DummyHandler)
    logger.info("Dummy service listening on 8080")
    server.serve_forever()


if __name__ == "__main__":
    run()
