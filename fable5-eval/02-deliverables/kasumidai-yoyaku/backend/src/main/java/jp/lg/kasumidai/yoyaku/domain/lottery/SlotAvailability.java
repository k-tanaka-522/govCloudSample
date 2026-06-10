package jp.lg.kasumidai.yoyaku.domain.lottery;

import jp.lg.kasumidai.yoyaku.domain.reservation.SlotRequest;

/** 抽選時の空き判定(休館・優先枠・既予約を含む。KSM-BRL-001 §5.3 3-a)。 */
@FunctionalInterface
public interface SlotAvailability {

  boolean isOpen(SlotRequest slot);
}
