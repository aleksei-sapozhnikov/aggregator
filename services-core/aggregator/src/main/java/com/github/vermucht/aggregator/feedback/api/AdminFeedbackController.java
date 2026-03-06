package com.github.vermucht.aggregator.feedback.api;

import com.github.vermucht.aggregator.feedback.FeedbackService;
import com.github.vermucht.aggregator.feedback.model.FeedbackEntry;
import jakarta.annotation.Nonnull;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Admin API for querying feedback submissions. */
@RestController
@RequestMapping("/api/admin/feedback")
public class AdminFeedbackController {
  private final FeedbackService feedbackService;

  public AdminFeedbackController(@Nonnull FeedbackService feedbackService) {
    this.feedbackService = feedbackService;
  }

  @GetMapping
  @Nonnull
  public List<FeedbackEntry> listRecent(@RequestParam(required = false) Integer limit) {
    return feedbackService.listRecent(limit);
  }
}
