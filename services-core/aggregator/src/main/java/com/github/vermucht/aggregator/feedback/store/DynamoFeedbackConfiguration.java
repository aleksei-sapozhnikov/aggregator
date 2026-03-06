package com.github.vermucht.aggregator.feedback.store;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;

/** Creates DynamoDB-specific beans for feedback persistence. */
@Configuration
@ConditionalOnExpression("'${feedback.store-type:local}'.equalsIgnoreCase('dynamo')")
public class DynamoFeedbackConfiguration {
  @Bean
  public DynamoDbClient dynamoDbClient() {
    return DynamoDbClient.builder().build();
  }
}
