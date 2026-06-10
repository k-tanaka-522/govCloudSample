package jp.lg.kasumidai.yoyaku.domain.lottery;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Random;
import jp.lg.kasumidai.yoyaku.domain.reservation.SlotRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 抽選アルゴリズムのテスト(KSM-BRL-001 §5.3。乱数順序再現=シード固定試験:KSM-TSP-001 §5.1)。
 */
class LotteryDrawServiceTest {

  private static final LocalDate DATE = LocalDate.of(2026, 8, 1);
  private static final long SEED = 20260610L;

  private final LotteryDrawService service = new LotteryDrawService();

  private final SlotRequest slotX = new SlotRequest(1L, DATE, 1L);
  private final SlotRequest slotY = new SlotRequest(1L, DATE, 2L);
  private final SlotRequest slotZ = new SlotRequest(2L, DATE, 1L);

  private LotteryEntry entry(long id, long userId, SlotRequest first, SlotRequest second) {
    return new LotteryEntry(
        id,
        userId,
        List.of(
            new LotteryPreference(1, List.of(first)), new LotteryPreference(2, List.of(second))));
  }

  @Test
  @DisplayName("シード固定で結果が再現可能(公平性の事後検証=実行ログとの突合可能性)")
  void deterministicWithFixedSeed() {
    List<LotteryEntry> entries =
        List.of(entry(1L, 11L, slotX, slotY), entry(2L, 12L, slotX, slotZ));
    List<LotteryResult> first =
        service.draw(entries, new Random(SEED), s -> true, (u, s) -> true);
    List<LotteryResult> second =
        service.draw(entries, new Random(SEED), s -> true, (u, s) -> true);
    assertThat(first).isEqualTo(second);
  }

  @Test
  @DisplayName("第1希望競合時:乱数順で先の申込が当選し、後の申込は第2希望で当選(希望順位評価)")
  void preferenceOrderEvaluation() {
    List<LotteryEntry> entries =
        List.of(entry(1L, 11L, slotX, slotY), entry(2L, 12L, slotX, slotZ));
    List<LotteryResult> results =
        service.draw(entries, new Random(SEED), s -> true, (u, s) -> true);

    assertThat(results).allMatch(LotteryResult::won);
    LotteryResult winnerOfX =
        results.stream().filter(r -> r.wonSlots().contains(slotX)).findFirst().orElseThrow();
    LotteryResult other =
        results.stream().filter(r -> !r.wonSlots().contains(slotX)).findFirst().orElseThrow();
    assertThat(winnerOfX.wonRank()).isEqualTo(1);
    assertThat(other.wonRank()).isEqualTo(2);
    // 乱数キー昇順=処理順:slotXの当選者はキーが小さい方
    assertThat(winnerOfX.randomKey()).isLessThan(other.randomKey());
  }

  @Test
  @DisplayName("全希望不成立は落選とし、乱数キー順の落選順位を記録(繰上げ用=職員手動繰上げQA No.15)")
  void losersGetLosingOrderForManualPromotion() {
    // 3申込が同一コマのみを希望:1名当選・2名落選(落選順位1,2)
    LotteryEntry e1 =
        new LotteryEntry(1L, 11L, List.of(new LotteryPreference(1, List.of(slotX))));
    LotteryEntry e2 =
        new LotteryEntry(2L, 12L, List.of(new LotteryPreference(1, List.of(slotX))));
    LotteryEntry e3 =
        new LotteryEntry(3L, 13L, List.of(new LotteryPreference(1, List.of(slotX))));
    List<LotteryResult> results =
        service.draw(List.of(e1, e2, e3), new Random(SEED), s -> true, (u, s) -> true);

    assertThat(results.stream().filter(LotteryResult::won)).hasSize(1);
    List<LotteryResult> losers = results.stream().filter(r -> !r.won()).toList();
    assertThat(losers).extracting(LotteryResult::losingOrder).containsExactly(1, 2);
    // 落選順位は乱数キー昇順
    assertThat(losers.get(0).randomKey()).isLessThan(losers.get(1).randomKey());
  }

  @Test
  @DisplayName("上限再判定で不成立の希望は飛ばして次希望を評価(KSM-BRL-001 §5.4-1)")
  void limitCheckSkipsPreference() {
    LotteryEntry e1 = entry(1L, 11L, slotX, slotZ);
    // slotXを含む希望は上限超過として不成立にする
    WinLimitChecker checker = (userId, slots) -> !slots.contains(slotX);
    List<LotteryResult> results =
        service.draw(List.of(e1), new Random(SEED), s -> true, checker);
    assertThat(results.get(0).won()).isTrue();
    assertThat(results.get(0).wonRank()).isEqualTo(2);
    assertThat(results.get(0).wonSlots()).containsExactly(slotZ);
  }

  @Test
  @DisplayName("休館・優先枠コマを含む希望は不成立(空き判定)")
  void closedSlotRejectsPreference() {
    LotteryEntry e1 = entry(1L, 11L, slotX, slotZ);
    SlotAvailability availability = slot -> !slot.equals(slotX);
    List<LotteryResult> results =
        service.draw(List.of(e1), new Random(SEED), availability, (u, s) -> true);
    assertThat(results.get(0).wonRank()).isEqualTo(2);
  }
}
