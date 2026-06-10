package jp.lg.kasumidai.yoyaku.domain.lottery;

import java.util.List;
import jp.lg.kasumidai.yoyaku.domain.reservation.SlotRequest;

/**
 * 当選確定時の予約上限再判定(KSM-BRL-001 §1.2-1/§5.4-1)。
 * 超過する希望は不成立として次希望を評価する。
 */
@FunctionalInterface
public interface WinLimitChecker {

  boolean canWin(long userId, List<SlotRequest> slots);
}
