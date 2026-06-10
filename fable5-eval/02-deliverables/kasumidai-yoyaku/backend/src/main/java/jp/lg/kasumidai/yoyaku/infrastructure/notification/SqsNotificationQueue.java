package jp.lg.kasumidai.yoyaku.infrastructure.notification;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

/**
 * SQS通知キュー実装(yoyaku-{env}-queue-notification へ投入。KSM-ADR-008)。
 * 送信失敗は技術例外として伝播し、トランザクションごと失敗させる(取りこぼし防止)。
 */
@Component
public class SqsNotificationQueue implements NotificationQueue {

  private final SqsClient sqsClient;
  private final String queueUrl;

  public SqsNotificationQueue(
      SqsClient sqsClient, @Value("${yoyaku.notification.queue-url:}") String queueUrl) {
    this.sqsClient = sqsClient;
    this.queueUrl = queueUrl;
  }

  @Override
  public void publish(NotificationMessage message) {
    sqsClient.sendMessage(
        SendMessageRequest.builder()
            .queueUrl(queueUrl)
            .messageBody("{\"type\":\"" + message.type() + "\",\"targetId\":" + message.targetId() + "}")
            .build());
  }
}
