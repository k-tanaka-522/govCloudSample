package jp.lg.kasumidai.yoyaku.domain.fee;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * 取消規則(REQ-011/019。KSM-BRL-001 1.1版 §3.1。QA No.11回答反映)。
 *
 * <p>初期値(確定):利用日の7日前まで無料(全額還付)/6日前以降100%(還付なし)。
 * 市現行規則どおり中間料率(50%)は設けない。施設別の取消期限・料率は
 * マスタ設定値として保持し、将来の規則改正に備える(機能としては可変)。
 */
public record CancellationPolicy(int freeCancelDaysBefore, int chargeRatePercent) {

  /** 全率の分母(百分率)。 */
  public static final int PERCENT_BASE = 100;

  /** 初期値:7日前まで無料/6日前以降100%(QA No.11確定値)。 */
  public static final CancellationPolicy DEFAULT = new CancellationPolicy(7, PERCENT_BASE);

  /**
   * キャンセル料を算定する。減免後の請求額を基礎額とする(KSM-BRL-001 §4.3)。
   *
   * @param useDate 利用日
   * @param cancelDate 取消日
   * @param chargedAmountYen 基礎額(減免後請求額)
   * @return キャンセル料(円)。取消期限内(利用日の7日前まで)は0
   */
  public long calculateCharge(LocalDate useDate, LocalDate cancelDate, long chargedAmountYen) {
    long daysBefore = ChronoUnit.DAYS.between(cancelDate, useDate);
    if (daysBefore >= freeCancelDaysBefore) {
      return 0L;
    }
    return chargedAmountYen * chargeRatePercent / PERCENT_BASE;
  }

  /** 無料取消の期限日(この日までの取消は無料)。画面の事前表示(SC-U10)に使用する。 */
  public LocalDate freeCancelDeadline(LocalDate useDate) {
    return useDate.minusDays(freeCancelDaysBefore);
  }
}
