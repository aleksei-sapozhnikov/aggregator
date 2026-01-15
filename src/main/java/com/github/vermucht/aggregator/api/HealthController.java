package com.github.vermucht.aggregator.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** REST controller that exposes liveness information for the service. */
@RestController
public class HealthController {

  /**
   * Returns a simple health string for uptime checks.
   *
   * @return static health indicator
   */
  @GetMapping("/health")
  public String health() {
    return "OK";
  }
}
