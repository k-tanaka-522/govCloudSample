package jp.lg.kasumidai.yoyaku.presentation.api.staff;

import jp.lg.kasumidai.yoyaku.application.lottery.ExecuteLotteryUseCase;
import jp.lg.kasumidai.yoyaku.domain.lottery.LotteryExecutionService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 抽選管理API(REQ-008。SC-S09。所管課ロール以上)。
 * 通常の抽選実行はJB-01(EventBridge Scheduler→ECS RunTask)。本APIはバッチ失敗時の
 * 再実行(QA No.14回答のP6運用手順と連動)・動作確認用の職員起動経路。
 */
@RestController
@RequestMapping("/staff/v1/lottery-periods")
public class LotteryAdminController {

  private final ExecuteLotteryUseCase executeLotteryUseCase;

  public LotteryAdminController(ExecuteLotteryUseCase executeLotteryUseCase) {
    this.executeLotteryUseCase = executeLotteryUseCase;
  }

  @PostMapping("/{id}/executions")
  public ExecutionResponseDto execute(
      @RequestHeader("X-Dev-Staff-Id") long staffId, @PathVariable("id") long lotteryPeriodId) {
    LotteryExecutionService.ExecutionSummary summary =
        executeLotteryUseCase.execute(lotteryPeriodId);
    return new ExecutionResponseDto(summary.entryCount(), summary.wonCount(), summary.lostCount());
  }

  /** 実行サマリ応答(申込数・当選数・落選数=KSM-DDD-001 §6.2-3)。 */
  public record ExecutionResponseDto(int entryCount, int wonCount, int lostCount) {}
}
