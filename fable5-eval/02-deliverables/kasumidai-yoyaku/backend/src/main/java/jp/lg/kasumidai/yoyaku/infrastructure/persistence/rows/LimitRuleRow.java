package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

/** 予約上限ルール行(reservation_limit_rules。初期値はQA No.10確定値=V2マイグレーションで投入)。 */
public record LimitRuleRow(
    int monthlyMaxSlots,
    int sameDayMaxSlots,
    int maxOpenReservations,
    int acceptStartMonthsBefore,
    int acceptStartHour) {}
