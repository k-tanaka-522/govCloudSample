/** 抽選管理API呼出し(インフラ層。/api/staff/* =WAF IP制限+MFA経路。KSM-ADR-003)。 */
import { postJson } from './httpClient';

export interface LotteryExecutionApiResponse {
  entryCount: number;
  wonCount: number;
  lostCount: number;
}

export const postLotteryExecution = (
  lotteryPeriodId: number,
): Promise<LotteryExecutionApiResponse> =>
  postJson(`/api/staff/v1/lottery-periods/${String(lotteryPeriodId)}/executions`, {});
