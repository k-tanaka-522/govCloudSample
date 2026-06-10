package jp.lg.kasumidai.yoyaku.domain.reservation;

/**
 * 予約上限ルール(施設×利用者区分。KSM-BRL-001 §1.1 L-1〜L-4)。
 * 値はマスタ(reservation_limit_rules)設定値であり、初期値はQA No.10で市了承済み:
 * L-1 体育施設12コマ/月・公民館等8コマ/月、L-2 同一日3コマ、L-3 同時保有30件、
 * L-4 受付開始 市内=利用月2か月前の1日9:00・市外=1か月前の1日9:00。
 */
public record ReservationLimitRule(
    int monthlyMaxSlots,
    int sameDayMaxSlots,
    int maxOpenReservations,
    int acceptStartMonthsBefore,
    int acceptStartHour) {}
