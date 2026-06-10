package jp.lg.kasumidai.yoyaku.domain.reservation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 一括予約整合のテスト(REQ-010。KSM-BRL-001 §2:全件成立または全件不成立の仕様証明)。
 */
class BulkReservationValidatorTest {

  private static final LocalDate DATE = LocalDate.of(2026, 7, 4);

  private final BulkReservationValidator validator = new BulkReservationValidator();

  private final SlotRequest slotA = new SlotRequest(101L, DATE, 1L);
  private final SlotRequest slotB = new SlotRequest(101L, DATE.plusDays(7), 1L);
  private final SlotRequest slotC = new SlotRequest(102L, DATE, 2L);

  @Test
  @DisplayName("全コマ利用可+上限内=全件成立")
  void allGrantedWhenNoConflict() {
    BulkReservationValidator.Result result =
        validator.validate(List.of(slotA, slotB, slotC), s -> Optional.empty(), List.of());
    assertThat(result.allGranted()).isTrue();
    assertThat(result.conflicts()).isEmpty();
  }

  @Test
  @DisplayName("一部コマ競合=全件不成立(部分自動確定・歯抜け予約は行わない)+不成立理由の全件一覧")
  void allRejectedWhenPartialConflict() {
    BulkReservationValidator.Result result =
        validator.validate(
            List.of(slotA, slotB, slotC),
            s -> s.equals(slotB) ? Optional.of(ConflictReason.RESERVED) : Optional.empty(),
            List.of());
    assertThat(result.allGranted()).isFalse();
    assertThat(result.conflicts())
        .containsExactly(new SlotConflict(slotB, ConflictReason.RESERVED));
  }

  @Test
  @DisplayName("上限超過時は全コマがLIMIT_EXCEEDEDとして不成立一覧に含まれる")
  void limitViolationRejectsAll() {
    BulkReservationValidator.Result result =
        validator.validate(
            List.of(slotA, slotC),
            s -> Optional.empty(),
            List.of(new LimitViolation(LimitViolation.LimitType.MONTHLY_SLOTS, 12, 13)));
    assertThat(result.allGranted()).isFalse();
    assertThat(result.conflicts())
        .extracting(SlotConflict::reason)
        .containsOnly(ConflictReason.LIMIT_EXCEEDED);
    assertThat(result.conflicts()).hasSize(2);
  }

  @Test
  @DisplayName("INSERT順は(unit_id, use_date, slot_id)昇順に正規化(デッドロック防止=KSM-BRL-001 §2.2-2)")
  void sortsSlotsForDeadlockPrevention() {
    List<SlotRequest> sorted = validator.sorted(List.of(slotC, slotB, slotA));
    assertThat(sorted).containsExactly(slotA, slotB, slotC);
  }

  @Test
  @DisplayName("境界値:展開上限26コマは可・27コマは拒否(KSM-BRL-001 §2.1-2)")
  void expansionLimitBoundary() {
    List<SlotRequest> max =
        java.util.stream.IntStream.rangeClosed(1, BulkReservationValidator.MAX_SLOTS_PER_REQUEST)
            .mapToObj(i -> new SlotRequest(1L, DATE.plusDays(i), 1L))
            .toList();
    assertThat(validator.validate(max, s -> Optional.empty(), List.of()).allGranted()).isTrue();

    List<SlotRequest> over =
        java.util.stream.IntStream.rangeClosed(0, BulkReservationValidator.MAX_SLOTS_PER_REQUEST)
            .mapToObj(i -> new SlotRequest(1L, DATE.plusDays(i), 1L))
            .toList();
    assertThatThrownBy(() -> validator.validate(over, s -> Optional.empty(), List.of()))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  @DisplayName("同一コマの重複指定は拒否")
  void rejectsDuplicateSlots() {
    assertThatThrownBy(
            () -> validator.validate(List.of(slotA, slotA), s -> Optional.empty(), List.of()))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
