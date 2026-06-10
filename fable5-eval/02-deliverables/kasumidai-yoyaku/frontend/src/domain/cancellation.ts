/**
 * 取消規則の表示計算(KSM-BRL-001 1.1版 §3.1=QA No.11確定値)。
 * 利用日の7日前まで無料(全額還付)/6日前以降100%(還付なし)。中間料率なし。
 * 確定計算の正はサーバ側(CancellationPolicy)であり、本モジュールは事前表示用(SC-U10)。
 */
import {
  CANCEL_CHARGE_RATE_PERCENT,
  FREE_CANCEL_DAYS_BEFORE,
  MS_PER_DAY,
  PERCENT_BASE,
} from './constants';

/** 日付文字列(YYYY-MM-DD)をUTC起点のミリ秒に変換する。 */
const toUtcMs = (isoDate: string): number => {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw new Error(`日付形式が不正です: ${isoDate}`);
  }
  return ms;
};

/** 取消日から利用日までの日数。 */
export const daysBefore = (useDate: string, cancelDate: string): number =>
  Math.floor((toUtcMs(useDate) - toUtcMs(cancelDate)) / MS_PER_DAY);

/** キャンセル料(円)。7日前まで0/6日前以降100%。 */
export const calculateCancellationCharge = (
  useDate: string,
  cancelDate: string,
  chargedAmount: number,
): number => {
  if (daysBefore(useDate, cancelDate) >= FREE_CANCEL_DAYS_BEFORE) {
    return 0;
  }
  return Math.floor((chargedAmount * CANCEL_CHARGE_RATE_PERCENT) / PERCENT_BASE);
};

/** 無料取消期限日(YYYY-MM-DD)。 */
export const freeCancelDeadline = (useDate: string): string => {
  const deadline = new Date(toUtcMs(useDate) - FREE_CANCEL_DAYS_BEFORE * MS_PER_DAY);
  return deadline.toISOString().slice(0, 'YYYY-MM-DD'.length);
};

/** 取消規則の説明文(SC-U08確認画面・SC-U10で常時表示=KSM-DDD-001 §1.5)。 */
export const describeCancellationRule = (): string =>
  `利用日の${String(FREE_CANCEL_DAYS_BEFORE)}日前までの取消は無料(全額還付)、` +
  `${String(FREE_CANCEL_DAYS_BEFORE - 1)}日前以降の取消は利用料金の全額をご負担いただきます。`;
