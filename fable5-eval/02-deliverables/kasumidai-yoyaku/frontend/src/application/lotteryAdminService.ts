/**
 * 抽選管理ユースケース(アプリケーション層。SC-S09。所管課ロール以上)。
 * 通常実行はJB-01バッチ。本画面はバッチ失敗時の再実行(QA No.14)・結果確認用。
 */
import { executeLottery } from '../domain/gateways/lotteryAdminGateway';
import type { LotteryExecutionSummary } from '../domain/gateways/lotteryAdminGateway';

export type { LotteryExecutionSummary } from '../domain/gateways/lotteryAdminGateway';

export const runLottery = (lotteryPeriodId: number): Promise<LotteryExecutionSummary> =>
  executeLottery(lotteryPeriodId);
