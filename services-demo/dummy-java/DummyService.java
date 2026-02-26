import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Dummy Java service used to simulate a simple service health endpoint.
 *
 * <p>The service exposes two HTTP endpoints:
 *
 * <ul>
 *   <li>{@code /health/{pointId}} – returns the current health status
 *   <li>{@code /set-health/{pointId}/{UP|DOWN}} – updates the specified health point
 * </ul>
 *
 * <p>This service is intended for testing and demonstration purposes only.
 */
public class DummyService {
  private static final Logger LOG = Logger.getLogger(DummyService.class.getName());
  private static final Map<String, String> STATUSES = new ConcurrentHashMap<>();

  static void main(String[] ignoredArgs) throws IOException {
    configureLogging();

    int port = 8080;
    HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
    server.createContext("/health", new HealthHandler());
    server.createContext("/set-health", new SetStateHandler());
    server.setExecutor(Executors.newFixedThreadPool(4));
    server.start();

    LOG.info(String.format("Dummy service listening on %d", port));
  }

  private static void configureLogging() {
    // Keep defaults; allow overriding via -Djava.util.logging.SimpleFormatter.format=...
    LOG.setLevel(Level.INFO);
    System.setProperty("java.util.logging.SimpleFormatter.format", "%1$tF %1$tT %4$s %5$s%n");
  }

  private static String getStatus(String pointId) {
    return STATUSES.getOrDefault(pointId, "UP");
  }

  private static String statusPayload(String pointId) {
    return String.format("{\n  \"status\": \"%s\"\n}", getStatus(pointId));
  }

  private static void sendJson(HttpExchange exchange, int statusCode, String payload)
      throws IOException {
    Headers headers = exchange.getResponseHeaders();
    headers.set("Content-Type", "application/json");
    byte[] body = payload.getBytes(StandardCharsets.UTF_8);
    exchange.sendResponseHeaders(statusCode, body.length);
    try (OutputStream output = exchange.getResponseBody()) {
      output.write(body);
    }
  }

  private static void sendResponse(HttpExchange exchange, int statusCode, String message)
      throws IOException {
    byte[] body = message.getBytes(StandardCharsets.UTF_8);
    exchange.sendResponseHeaders(statusCode, body.length);
    try (OutputStream output = exchange.getResponseBody()) {
      output.write(body);
    }
  }

  private static class HealthHandler implements HttpHandler {
    @Override
    public void handle(HttpExchange exchange) throws IOException {
      String method = exchange.getRequestMethod();
      String path = exchange.getRequestURI().getPath();
      if (!"GET".equalsIgnoreCase(method)) {
        sendResponse(exchange, 405, "Method Not Allowed");
        LOG.warning(method + " " + path + " -> 405");
        return;
      }

      String[] parts = path.split("/");
      if (parts.length < 2 || !"health".equals(parts[1])) {
        sendResponse(exchange, 404, "Not Found");
        LOG.warning(method + " " + path + " -> 404");
        return;
      }

      String pointId;
      if (parts.length == 3) {
        pointId = parts[2];
      } else {
        sendResponse(exchange, 404, "Not Found");
        LOG.warning(method + " " + path + " -> 404");
        return;
      }

      sendJson(exchange, 200, statusPayload(pointId));
      LOG.info("GET " + path + " -> " + getStatus(pointId));
    }
  }

  private static class SetStateHandler implements HttpHandler {
    @Override
    public void handle(HttpExchange exchange) throws IOException {
      String method = exchange.getRequestMethod();
      if (!"GET".equalsIgnoreCase(method)) {
        sendResponse(exchange, 405, "Only GET method allowed");
        LOG.warning(method + " " + exchange.getRequestURI().getPath() + " -> 405");
        return;
      }

      URI uri = exchange.getRequestURI();
      String path = uri.getPath(); // e.g. /set-health/1/down

      String[] parts = path.split("/");
      if (parts.length < 3 || !"set-health".equals(parts[1])) {
        sendResponse(exchange, 400, "Expected /set-health/{pointId}/{up|down}");
        LOG.warning("GET " + path + " -> 400 (bad path)");
        return;
      }

      String pointId;
      String stateValue;
      if (parts.length == 4) {
        pointId = parts[2];
        stateValue = parts[3];
      } else {
        sendResponse(exchange, 400, "Expected /set-health/{pointId}/{up|down}");
        LOG.warning("GET " + path + " -> 400 (bad path)");
        return;
      }

      String normalized = stateValue.trim().toUpperCase(Locale.ROOT);
      if (!"UP".equals(normalized) && !"DOWN".equals(normalized)) {
        sendResponse(exchange, 400, "value must be up or down");
        LOG.warning("GET " + path + " -> 400 (bad value)");
        return;
      }

      STATUSES.put(pointId, normalized);
      sendJson(exchange, 200, statusPayload(pointId));
      LOG.info("GET " + path + " -> " + normalized);
    }
  }
}
