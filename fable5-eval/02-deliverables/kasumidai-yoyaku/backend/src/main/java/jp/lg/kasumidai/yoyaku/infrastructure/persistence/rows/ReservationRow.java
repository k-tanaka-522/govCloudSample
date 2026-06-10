package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

import java.time.LocalDate;

/** 予約の照会行(取消判定に必要な属性のみ)。 */
public record ReservationRow(
    long reservationId,
    long userId,
    long facilityId,
    String status,
    long billedAmountYen,
    long paidAmountYen,
    LocalDate firstUseDate) {}
