package jp.lg.kasumidai.yoyaku.domain.reservation;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

/**
 * 一括予約の整合判定(REQ-010。KSM-BRL-001 §2.1)。
 * 単一トランザクションで「全件成立または全件不成立」とし、不成立時は全件の理由一覧を返す
 * (部分自動確定=歯抜け予約は行わない)。
 */
public final class BulkReservationValidator {

  /** 定期利用の展開上限:3か月先まで・最大26コマ/申込(KSM-BRL-001 §2.1-2)。 */
  public static final int MAX_SLOTS_PER_REQUEST = 26;

  /** 判定結果:成立可否と不成立コマの全件一覧。 */
  public record Result(boolean allGranted, List<SlotConflict> conflicts) {}

  /**
   * 全コマの可用性と上限判定の結果を合成する。
   *
   * @param requested 申込コマ(展開済み)
   * @param availabilityCheck コマ単位の不成立理由(空=利用可)
   * @param limitViolations 上限判定結果(KSM-BRL-001 §1)
   */
  public Result validate(
      List<SlotRequest> requested,
      Function<SlotRequest, Optional<ConflictReason>> availabilityCheck,
      List<LimitViolation> limitViolations) {
    requireWithinExpansionLimit(requested);
    requireNoDuplicate(requested);
    List<SlotConflict> conflicts = new ArrayList<>();
    for (SlotRequest slot : sorted(requested)) {
      availabilityCheck.apply(slot).ifPresent(reason -> conflicts.add(new SlotConflict(slot, reason)));
    }
    if (!limitViolations.isEmpty()) {
      for (SlotRequest slot : sorted(requested)) {
        conflicts.add(new SlotConflict(slot, ConflictReason.LIMIT_EXCEEDED));
      }
    }
    return new Result(conflicts.isEmpty(), List.copyOf(conflicts));
  }

  /** INSERT順の正規化(昇順。デッドロック防止=KSM-BRL-001 §2.2-2)。 */
  public List<SlotRequest> sorted(List<SlotRequest> requested) {
    return requested.stream().sorted().toList();
  }

  private void requireWithinExpansionLimit(List<SlotRequest> requested) {
    if (requested.isEmpty() || requested.size() > MAX_SLOTS_PER_REQUEST) {
      throw new IllegalArgumentException(
          "申込コマ数は1〜" + MAX_SLOTS_PER_REQUEST + "の範囲とすること(KSM-BRL-001 §2.1-2)");
    }
  }

  private void requireNoDuplicate(List<SlotRequest> requested) {
    Set<SlotRequest> unique = new LinkedHashSet<>(requested);
    if (unique.size() != requested.size()) {
      throw new IllegalArgumentException("同一コマの重複指定は不可");
    }
  }
}
