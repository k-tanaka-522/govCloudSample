package jp.lg.kasumidai.yoyaku.domain.hold;

import java.time.LocalDateTime;

/**
 * 仮押さえの保持期限(REQ-021。KSM-BRL-001 §6)。
 * 保持期限の初期値は7日(QA No.16で市了承)。施設別マスタ・SC-S02での個別変更が可能。
 * 期限超過分は JB-02(15分間隔)が hold→expired へ解放する。
 */
public record HoldExpiryPolicy(int holdDays) {

  /** 初期値:7日(QA No.16確定値)。 */
  public static final HoldExpiryPolicy DEFAULT = new HoldExpiryPolicy(7);

  /** 仮押さえ登録時刻から期限を計算する。 */
  public LocalDateTime expiresAt(LocalDateTime heldAt) {
    return heldAt.plusDays(holdDays);
  }

  /** 期限超過か(JB-02 の解放判定)。 */
  public boolean isExpired(LocalDateTime heldAt, LocalDateTime now) {
    return now.isAfter(expiresAt(heldAt));
  }
}
