package jp.lg.kasumidai.yoyaku.domain.reservation;

/** 上限ルール違反の内容(種別と上限値・実値)。 */
public record LimitViolation(LimitType type, int limit, int actual) {

  /** ルール種別(KSM-BRL-001 §1.1)。 */
  public enum LimitType {
    MONTHLY_SLOTS,
    SAME_DAY_SLOTS,
    OPEN_RESERVATIONS,
    ACCEPT_NOT_STARTED
  }
}
