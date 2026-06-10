package jp.lg.kasumidai.yoyaku.domain.reservation;

/** 予約状態(KSM-DDD-001 §3.3 #10:仮押さえ/確定待ち/確定/取消/期限切れ)。 */
public enum ReservationStatus {
  HOLD,
  PENDING,
  CONFIRMED,
  CANCELLED,
  EXPIRED;

  /** 上限カウント・二重予約判定の対象(KSM-BRL-001 §1.2-1:hold/pending/confirmed)。 */
  public boolean isActive() {
    return this == HOLD || this == PENDING || this == CONFIRMED;
  }
}
