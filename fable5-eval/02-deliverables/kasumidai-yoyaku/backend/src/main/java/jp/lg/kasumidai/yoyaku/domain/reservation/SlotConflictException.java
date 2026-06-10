package jp.lg.kasumidai.yoyaku.domain.reservation;

import java.util.List;
import jp.lg.kasumidai.yoyaku.domain.common.DomainException;

/**
 * 一括予約の不成立(全件不成立=REQ-010)。不成立コマと理由の全件一覧を保持し、
 * UI層で 409+conflictItems として返却する(KSM-DDD-001 §4.4)。
 */
public class SlotConflictException extends DomainException {

  private final transient List<SlotConflict> conflicts;

  public SlotConflictException(List<SlotConflict> conflicts) {
    super("slot-conflict", "選択コマの一部が予約できません");
    this.conflicts = List.copyOf(conflicts);
  }

  public List<SlotConflict> getConflicts() {
    return conflicts;
  }
}
