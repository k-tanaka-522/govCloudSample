package jp.lg.kasumidai.yoyaku.infrastructure.persistence;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.NewReservationRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.ReservationRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.SlotKeyRow;

/**
 * 予約永続化(reservations / reservation_details)。
 * 二重予約の最終防衛線は部分一意インデックス uq_active_slot(KSM-DDD-001 §3.4)。
 */
public interface ReservationRepository {

  /** 同一利用者×同一施設の有効明細(hold/pending/confirmed)を利用月別に集計する(L-1判定)。 */
  Map<YearMonth, Integer> countActiveSlotsByMonth(long userId, long facilityId);

  /** 同一利用者×同一施設の有効明細を利用日別に集計する(L-2判定)。 */
  Map<LocalDate, Integer> countActiveSlotsByDate(long userId, long facilityId);

  /** 利用日未到来の同時保有予約数(施設横断。L-3判定)。 */
  int countOpenReservations(long userId, LocalDate today);

  /** 指定コマのうち既に有効予約が存在するもの(申込時の再検証=KSM-ADR-009決定3)。 */
  List<SlotKeyRow> findConflictingSlots(List<SlotKeyRow> slots);

  /** 指定コマのうち休館・優先枠に該当するもの(コマ→種別 closed/priority)。 */
  Map<SlotKeyRow, String> findClosedOrPrioritySlots(List<SlotKeyRow> slots);

  /**
   * 1予約+複数明細を単一トランザクション内でINSERTする(全件成立または全件不成立=REQ-010)。
   * 同時申込の競合は uq_active_slot の一意制約違反として
   * {@link org.springframework.dao.DuplicateKeyException} が送出される。
   */
  long insertReservation(NewReservationRow row);

  /** 本人の予約を取得する(IDOR防止:user_id を条件に含める=KSM-DEV-002 S-11)。 */
  Optional<ReservationRow> findByIdForUser(long reservationId, long userId);

  /** 楽観的状態遷移(WHERE句に前提状態を含むUPDATE=KSM-DDD-001 §6.2-1)。成功時true。 */
  boolean transitStatus(long reservationId, String fromStatus, String toStatus);

  /** 期限超過の仮押さえを解放する(JB-02:hold→expired)。解放件数を返す。 */
  int expireHolds(OffsetDateTime now);
}
