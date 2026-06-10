package jp.lg.kasumidai.yoyaku.domain.reservation;

/** 不成立コマと理由(全件一覧で返却する。KSM-DDD-001 §4.4 Response 409)。 */
public record SlotConflict(SlotRequest slot, ConflictReason reason) {}
