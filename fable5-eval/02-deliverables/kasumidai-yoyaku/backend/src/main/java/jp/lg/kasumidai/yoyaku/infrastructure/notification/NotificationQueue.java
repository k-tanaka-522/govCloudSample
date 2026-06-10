package jp.lg.kasumidai.yoyaku.infrastructure.notification;

/**
 * 通知キューへの投入(REQ-012。KSM-ADR-008:API/バッチ→SQS→ワーカー→SES)。
 * メッセージに個人情報は含めない(通知種別+対象IDのみ。本文はワーカーがDBから組み立てる)。
 */
public interface NotificationQueue {

  /** 通知メッセージ(種別と対象ID。冪等判定は notification_logs で行う=KSM-DDD-001 §6.2-1)。 */
  record NotificationMessage(String type, long targetId) {}

  void publish(NotificationMessage message);
}
