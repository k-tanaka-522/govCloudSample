/**
 * 業務ルール定数(KSM-BRL-001 1.1版。QA No.10〜16の市確定値)。
 * 画面の事前表示・クライアント側プレチェック用。判定の正はサーバ側マスタ
 * (reservation_limit_rules ほか)であり、本定数は初期値のミラー。
 */

/** 取消無料期限:利用日の7日前まで(QA No.11)。 */
export const FREE_CANCEL_DAYS_BEFORE = 7;

/** 取消期限後のキャンセル料率:100%(QA No.11。中間料率なし)。 */
export const CANCEL_CHARGE_RATE_PERCENT = 100;

/** 百分率の分母。 */
export const PERCENT_BASE = 100;

/** 一括予約の展開上限:26コマ/申込(KSM-BRL-001 §2.1-2)。 */
export const MAX_SLOTS_PER_REQUEST = 26;

/** L-2 同一日上限コマ数:3コマ(QA No.10)。 */
export const SAME_DAY_MAX_SLOTS = 3;

/** L-1 月間コマ数上限(体育施設):12コマ/月(QA No.10)。 */
export const MONTHLY_MAX_SLOTS_SPORTS = 12;

/** L-1 月間コマ数上限(公民館・文化系):8コマ/月(QA No.10)。 */
export const MONTHLY_MAX_SLOTS_CULTURE = 8;

/** 1日のミリ秒数(日数計算用)。 */
export const MS_PER_DAY = 86_400_000;
