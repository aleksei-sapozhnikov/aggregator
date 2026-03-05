package com.github.vermucht.aggregator.feedback.api;

import com.github.vermucht.aggregator.feedback.FeedbackService;
import com.github.vermucht.aggregator.feedback.model.FeedbackEntry;
import jakarta.annotation.Nonnull;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Public HTTP API for receiving user feedback from aggregator-ui. */
@RestController
@RequestMapping("/api/feedback")
public class FeedbackController {
  private final FeedbackService feedbackService;

  public FeedbackController(@Nonnull FeedbackService feedbackService) {
    this.feedbackService = feedbackService;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @Nonnull
  public FeedbackSubmissionResponse submit(@RequestBody @Nonnull FeedbackSubmissionRequest request) {
    try {
      FeedbackEntry entry = feedbackService.submit(request.text());
      return new FeedbackSubmissionResponse(entry.id(), entry.receivedAt());
    } catch (IllegalArgumentException exception) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage(), exception);
    }
  }
}
