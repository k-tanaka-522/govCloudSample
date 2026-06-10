package jp.lg.kasumidai.yoyaku.domain.reservation;

/** 一括予約の不成立理由(KSM-BRL-001 §2.1-3:予約済み/休館/優先枠/上限超過)。 */
public enum ConflictReason {
  RESERVED,
  CLOSED,
  PRIORITY_SLOT,
  LIMIT_EXCEEDED
}
