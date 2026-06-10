package jp.lg.kasumidai.yoyaku.domain.refund;

/**
 * 還付額の算定(REQ-019。KSM-BRL-001 §4.4)。
 * 還付対象 = 取消時の収納済額 − キャンセル料、および遡及減免の差額。
 */
public final class RefundCalculator {

  /** 取消に伴う還付額(負にはならない)。 */
  public long refundOnCancellation(long paidAmountYen, long cancellationChargeYen) {
    if (paidAmountYen < 0 || cancellationChargeYen < 0) {
      throw new IllegalArgumentException("金額が負値です");
    }
    return Math.max(0L, paidAmountYen - cancellationChargeYen);
  }

  /** 遡及減免(収納後の承認)の差額還付(KSM-BRL-001 §4.2-4)。 */
  public long refundOnRetroactiveExemption(long paidAmountYen, long newBilledAmountYen) {
    if (paidAmountYen < 0 || newBilledAmountYen < 0) {
      throw new IllegalArgumentException("金額が負値です");
    }
    return Math.max(0L, paidAmountYen - newBilledAmountYen);
  }
}
