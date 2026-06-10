package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

import java.time.LocalDate;

/** コマキー(unit_id × use_date × slot_id)。インフラ層の行表現(ドメイン型に依存しない)。 */
public record SlotKeyRow(long unitId, LocalDate useDate, long slotId) {}
