/** 抽選管理ゲートウェイ(ドメイン層→インフラ層)。 */
import { postLotteryExecution } from '../../infrastructure/lotteryAdminApi';

/** 抽選実行サマリ(申込数・当選数・落選数=KSM-DDD-001 §6.2-3)。 */
export interface LotteryExecutionSummary {
  entryCount: number;
  wonCount: number;
  lostCount: number;
}

export const executeLottery = async (
  lotteryPeriodId: number,
): Promise<LotteryExecutionSummary> => postLotteryExecution(lotteryPeriodId);
