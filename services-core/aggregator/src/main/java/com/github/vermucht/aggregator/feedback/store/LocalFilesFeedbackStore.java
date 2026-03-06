package com.github.vermucht.aggregator.feedback.store;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.vermucht.aggregator.feedback.model.FeedbackEntry;
import jakarta.annotation.Nonnull;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;

/**
 * Appends feedback entries to an NDJSON file.
 *
 * <p>Each entry is stored as one JSON line to keep writes simple and cheap.
 */
@Component
@ConditionalOnExpression("'${feedback.store-type:local}'.equalsIgnoreCase('local')")
public class LocalFilesFeedbackStore implements FeedbackStore {
  private final ObjectMapper objectMapper;
  private final Path filePath;
  private final Lock writeLock = new ReentrantLock();

  public LocalFilesFeedbackStore(
      @Nonnull ObjectMapper objectMapper,
      @Value("${feedback.local-files.path:./feedback.ndjson}") @Nonnull String storagePath) {
    this.objectMapper = objectMapper;
    this.filePath = Path.of(storagePath).toAbsolutePath().normalize();
  }

  @Override
  public void save(@Nonnull FeedbackEntry entry) {
    writeLock.lock();
    try {
      Path parent = filePath.getParent();
      if (parent != null) {
        Files.createDirectories(parent);
      }
      Files.writeString(
          filePath,
          toJsonLine(entry),
          StandardOpenOption.CREATE,
          StandardOpenOption.APPEND,
          StandardOpenOption.WRITE);
    } catch (IOException exception) {
      throw new IllegalStateException("Failed to persist feedback entry to " + filePath, exception);
    } finally {
      writeLock.unlock();
    }
  }

  @Override
  @Nonnull
  public List<FeedbackEntry> listRecent(int limit) {
    writeLock.lock();
    try {
      if (!Files.exists(filePath)) {
        return List.of();
      }
      List<FeedbackEntry> entries = new ArrayList<>();
      for (String line : Files.readAllLines(filePath)) {
        String trimmed = line.trim();
        if (trimmed.isEmpty()) {
          continue;
        }
        try {
          entries.add(objectMapper.readValue(trimmed, FeedbackEntry.class));
        } catch (JsonProcessingException ignored) {
          // Skip malformed lines to preserve read availability for valid entries.
        }
      }
      entries.sort(Comparator.comparing(FeedbackEntry::receivedAt).reversed());
      if (entries.size() <= limit) {
        return List.copyOf(entries);
      }
      return List.copyOf(entries.subList(0, limit));
    } catch (IOException exception) {
      throw new IllegalStateException(
          "Failed to read feedback entries from " + filePath, exception);
    } finally {
      writeLock.unlock();
    }
  }

  private String toJsonLine(FeedbackEntry entry) {
    try {
      return objectMapper.writeValueAsString(entry) + System.lineSeparator();
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("Failed to serialize feedback entry", exception);
    }
  }
}
