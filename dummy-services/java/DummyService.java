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
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Dummy Java service used to simulate a simple service health endpoint.
 *
 * <p>The service exposes two HTTP endpoints:
 *
 * <ul>
 *   <li>{@code /health} – returns the current health status ("UP" or "DOWN")
 *   <li>{@code /set-health/{UP|DOWN}} – updates the health status returned by {@code /health}
 * </ul>
 *
 * <p>This service is intended for testing and demonstration purposes only.
 */
public class DummyService {
  private static final Logger LOG = Logger.getLogger(DummyService.class.getName());
  private static final AtomicReference<String> STATUS = new AtomicReference<>("UP");

  public static void main(String[] args) throws IOException {
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

  private static String statusPayload() {
    return String.format("{\n  \"status\": \"%s\"\n}", STATUS.get());
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
      if (!"GET".equalsIgnoreCase(method)) {
        sendResponse(exchange, 405, "Method Not Allowed");
        LOG.warning(method + " /health -> 405");
        return;
      }
      sendJson(exchange, 200, statusPayload());
      LOG.info("GET /health -> " + STATUS.get());
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
      String path = uri.getPath(); // e.g. /set-health/up

      String[] parts = path.split("/");
      if (parts.length < 3) {
        sendResponse(exchange, 400, "Expected /set-health/up or /set-health/down");
        LOG.warning("GET " + path + " -> 400 (bad path)");
        return;
      }

      String normalized = parts[parts.length - 1].trim().toUpperCase(Locale.ROOT);
      if (!"UP".equals(normalized) && !"DOWN".equals(normalized)) {
        sendResponse(exchange, 400, "value must be up or down");
        LOG.warning("GET " + path + " -> 400 (bad value)");
        return;
      }

      STATUS.set(normalized);
      sendJson(exchange, 200, statusPayload());
      LOG.info("GET " + path + " -> " + STATUS.get());
    }
  }
}
