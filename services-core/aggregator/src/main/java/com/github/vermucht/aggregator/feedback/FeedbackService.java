package com.github.vermucht.aggregator.feedback;

import com.github.vermucht.aggregator.feedback.model.FeedbackEntry;
import com.github.vermucht.aggregator.feedback.store.FeedbackStore;
import jakarta.annotation.Nonnull;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** Validates and persists incoming feedback text. */
@Service
public class FeedbackService {
  private static final int MAX_TEXT_LENGTH = 10_000;
  private static final int DEFAULT_LIST_LIMIT = 200;
  private static final int MAX_LIST_LIMIT = 1000;
  private final FeedbackStore feedbackStore;
  private final Clock clock;

  @Autowired
  public FeedbackService(@Nonnull FeedbackStore feedbackStore) {
    this(feedbackStore, Clock.systemUTC());
  }

  FeedbackService(@Nonnull FeedbackStore feedbackStore, @Nonnull Clock clock) {
    this.feedbackStore = feedbackStore;
    this.clock = clock;
  }

  @Nonnull
  public FeedbackEntry submit(@Nonnull String rawText) {
    String text = rawText == null ? "" : rawText;
    if (text.isBlank()) {
      throw new IllegalArgumentException("Feedback text must not be blank");
    }
    if (text.length() > MAX_TEXT_LENGTH) {
      throw new IllegalArgumentException("Feedback text exceeds maximum length");
    }

    FeedbackEntry entry = new FeedbackEntry(UUID.randomUUID().toString(), Instant.now(clock), text);
    feedbackStore.save(entry);
    return entry;
  }

  @Nonnull
  public List<FeedbackEntry> listRecent(Integer limit) {
    int requested = limit == null ? DEFAULT_LIST_LIMIT : limit;
    int normalized = Math.max(1, Math.min(requested, MAX_LIST_LIMIT));
    return feedbackStore.listRecent(normalized);
  }
}
