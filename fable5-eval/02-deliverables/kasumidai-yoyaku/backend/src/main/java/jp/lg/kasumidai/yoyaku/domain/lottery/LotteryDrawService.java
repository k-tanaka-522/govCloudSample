package jp.lg.kasumidai.yoyaku.domain.lottery;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.random.RandomGenerator;
import jp.lg.kasumidai.yoyaku.domain.reservation.SlotRequest;

/**
 * 抽選アルゴリズム(REQ-008。KSM-BRL-001 §5.3。公平性担保)。
 *
 * <ol>
 *   <li>各申込に乱数キーを抽選実行時に付与(本番は SecureRandom を注入。KSM-BRL-001 §5.3-1)
 *   <li>乱数キー昇順に処理(申込時刻に依存しない=申込集中の不利を排除)
 *   <li>希望順位順に空き判定。全コマ未割当かつ上限・休館・優先枠に抵触しない最初の希望で当選
 *   <li>全希望不成立は落選(乱数キー順の落選順位を記録=繰上げ用。繰上げは職員手動=QA No.15)
 * </ol>
 *
 * <p>グループ向け優遇・連続当選回避は現行運用に存在しないため実装しない。将来要望時は
 * 乱数キーへの重み付け拡張点(assignRandomKeys)で対応可能な構造とする(KSM-BRL-001 §5.3)。
 */
public final class LotteryDrawService {

  /** キー付与済み申込(処理順の記録=実行ログ)。 */
  public record KeyedEntry(LotteryEntry entry, long randomKey) {}

  /**
   * 抽選を実行する。
   *
   * @param entries 抽選期間内の全申込
   * @param random 乱数源(本番:SecureRandom/単体テスト:シード固定 Random=KSM-TSP-001 §5.1)
   * @param availability 空き判定(休館・優先枠・既予約)
   * @param limitChecker 当選時の上限再判定(KSM-BRL-001 §5.4-1)
   */
  public List<LotteryResult> draw(
      List<LotteryEntry> entries,
      RandomGenerator random,
      SlotAvailability availability,
      WinLimitChecker limitChecker) {
    List<KeyedEntry> keyed = assignRandomKeys(entries, random);
    List<LotteryResult> results = new ArrayList<>();
    Set<SlotRequest> allocated = new HashSet<>();
    int losingOrder = 0;
    for (KeyedEntry keyedEntry : keyed) {
      Optional<LotteryPreference> winning =
          findWinningPreference(keyedEntry.entry(), allocated, availability, limitChecker);
      if (winning.isPresent()) {
        allocated.addAll(winning.get().slots());
        results.add(wonResult(keyedEntry, winning.get()));
      } else {
        losingOrder++;
        results.add(lostResult(keyedEntry, losingOrder));
      }
    }
    return List.copyOf(results);
  }

  /** 乱数キー付与+昇順整列(キー衝突時は entryId 昇順で安定化)。将来の重み付け拡張点。 */
  List<KeyedEntry> assignRandomKeys(List<LotteryEntry> entries, RandomGenerator random) {
    return entries.stream()
        .map(e -> new KeyedEntry(e, random.nextLong(Long.MAX_VALUE)))
        .sorted(
            Comparator.comparingLong(KeyedEntry::randomKey)
                .thenComparingLong(k -> k.entry().entryId()))
        .toList();
  }

  /** 希望順位順の空き判定(当選した希望以降は評価しない=KSM-BRL-001 §5.3 3-a)。 */
  private Optional<LotteryPreference> findWinningPreference(
      LotteryEntry entry,
      Set<SlotRequest> allocated,
      SlotAvailability availability,
      WinLimitChecker limitChecker) {
    for (LotteryPreference preference : entry.preferencesByRank()) {
      boolean allOpen =
          preference.slots().stream()
              .allMatch(slot -> !allocated.contains(slot) && availability.isOpen(slot));
      if (allOpen && limitChecker.canWin(entry.userId(), preference.slots())) {
        return Optional.of(preference);
      }
    }
    return Optional.empty();
  }

  private LotteryResult wonResult(KeyedEntry keyedEntry, LotteryPreference winning) {
    return new LotteryResult(
        keyedEntry.entry().entryId(),
        keyedEntry.entry().userId(),
        keyedEntry.randomKey(),
        true,
        winning.rank(),
        winning.slots(),
        LotteryResult.NOT_APPLICABLE);
  }

  private LotteryResult lostResult(KeyedEntry keyedEntry, int losingOrder) {
    return new LotteryResult(
        keyedEntry.entry().entryId(),
        keyedEntry.entry().userId(),
        keyedEntry.randomKey(),
        false,
        LotteryResult.NOT_APPLICABLE,
        List.of(),
        losingOrder);
  }
}
