package com.github.vermucht.aggregator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Bootstraps the Aggregator Spring Boot application. */
@SpringBootApplication
public class AggregatorApplication {

  /**
   * Application entry point.
   *
   * @param args command-line arguments
   */
  public static void main(String[] args) {
    SpringApplication.run(AggregatorApplication.class, args);
  }
}
