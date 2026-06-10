package jp.lg.kasumidai.yoyaku.application.lottery;

import java.time.LocalDateTime;
import jp.lg.kasumidai.yoyaku.domain.lottery.LotteryExecutionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 抽選実行ユースケース(JB-01。REQ-008)。
 * EventBridge Scheduler→ECS RunTask(バッチ起動)および SC-S09(職員画面)から呼び出す。
 * 冪等(実行済み期間の再実行は拒否=KSM-DDD-001 §6.2)。
 */
@Service
public class ExecuteLotteryUseCase {

  private final LotteryExecutionService lotteryExecutionService;

  public ExecuteLotteryUseCase(LotteryExecutionService lotteryExecutionService) {
    this.lotteryExecutionService = lotteryExecutionService;
  }

  @Transactional
  public LotteryExecutionService.ExecutionSummary execute(long lotteryPeriodId) {
    return lotteryExecutionService.execute(lotteryPeriodId, LocalDateTime.now());
  }
}
