package jp.lg.kasumidai.yoyaku.domain.hold;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 仮押さえ保持期限のテスト(REQ-021。KSM-BRL-001 §6=QA No.16確定:初期値7日)。 */
class HoldExpiryPolicyTest {

  private static final LocalDateTime HELD_AT = LocalDateTime.of(2026, 6, 10, 14, 30);

  private final HoldExpiryPolicy policy = HoldExpiryPolicy.DEFAULT;

  @Test
  @DisplayName("期限=登録から7日後の同時刻")
  void expiresSevenDaysAfterHold() {
    assertThat(policy.expiresAt(HELD_AT)).isEqualTo(LocalDateTime.of(2026, 6, 17, 14, 30));
  }

  @Test
  @DisplayName("境界値:期限ちょうどは未超過・1分後は超過(JB-02の解放判定)")
  void expiryBoundary() {
    LocalDateTime deadline = policy.expiresAt(HELD_AT);
    assertThat(policy.isExpired(HELD_AT, deadline)).isFalse();
    assertThat(policy.isExpired(HELD_AT, deadline.plusMinutes(1))).isTrue();
  }

  @Test
  @DisplayName("施設別マスタで保持期限を変更可能(SC-S02の個別変更=QA No.16)")
  void configurablePerFacility() {
    HoldExpiryPolicy threeDays = new HoldExpiryPolicy(3);
    assertThat(threeDays.expiresAt(HELD_AT)).isEqualTo(LocalDateTime.of(2026, 6, 13, 14, 30));
  }
}
