package com.github.vermucht.aggregator.feedback.store;

import com.github.vermucht.aggregator.feedback.model.FeedbackEntry;
import jakarta.annotation.Nonnull;
import java.util.List;

/** Persists feedback entries. */
public interface FeedbackStore {
  void save(@Nonnull FeedbackEntry entry);

  @Nonnull
  List<FeedbackEntry> listRecent(int limit);
}
