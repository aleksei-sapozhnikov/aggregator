package com.github.vermucht.aggregator.signalsource.polling;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.vermucht.aggregator.catalog.model.Catalog;
import com.github.vermucht.aggregator.catalog.model.Item;
import com.github.vermucht.aggregator.catalog.model.ItemId;
import com.github.vermucht.aggregator.signal.model.HealthStatus;
import com.github.vermucht.aggregator.signalsource.polling.http.configuration.HttpPollingSignalConfiguration;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.lang.NonNull;

class PollingSignalSourceFactoryTest {
  @NonNull
  private static List<HttpPollingSignalConfiguration> getHttpPollingSignalConfigurations(
      HttpServer server, ItemId itemId) {
    String url = "http://127.0.0.1:%d/health".formatted(server.getAddress().getPort());
    List<HttpPollingSignalConfiguration> definitions = new ArrayList<>();
    for (int index = 0; index < 256; index++) {
      definitions.add(
          new HttpPollingSignalConfiguration(
              "signal-" + index, "Health check", itemId.getValue(), url, "GET", null, null));
    }
    definitions.add(
        new HttpPollingSignalConfiguration(
            "slow-signal",
            "Health check",
            itemId.getValue(),
            url,
            "GET",
            Duration.ofSeconds(5),
            Duration.ofSeconds(30)));
    return definitions;
  }

  @Test
  void reusesHttpClientsForSignalsWithMatchingTimeouts() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/health",
        exchange -> {
          byte[] payload = "{\"status\":\"UP\"}".getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().set("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, payload.length);
          try (var body = exchange.getResponseBody()) {
            body.write(payload);
          }
        });
    server.start();

    PollingSignalSourceFactory factory = new PollingSignalSourceFactory();
    try {
      ItemId itemId = ItemId.of("example-service");
      Catalog catalog = new Catalog(Map.of(itemId, Item.of(itemId, "Example service")), List.of());
      List<HttpPollingSignalConfiguration> definitions =
          getHttpPollingSignalConfigurations(server, itemId);

      List<PollingSignalSource> sources = factory.buildSources(definitions, catalog);

      assertThat(sources).hasSize(257);
      assertThat(factory.sharedClientCount()).isEqualTo(2);
      assertThat(sources.getFirst().poll().status()).isEqualTo(HealthStatus.UP);
      assertThat(sources.get(256).poll().status()).isEqualTo(HealthStatus.UP);
    } finally {
      factory.closeHttpClients();
      server.stop(0);
    }
  }
}
