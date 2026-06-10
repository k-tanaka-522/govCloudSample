package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

import java.time.LocalDate;

/** 空き状況照会の行(コマ×状態。REQ-006)。 */
public record AvailabilitySlotRow(long unitId, LocalDate useDate, long slotId, String status) {}
