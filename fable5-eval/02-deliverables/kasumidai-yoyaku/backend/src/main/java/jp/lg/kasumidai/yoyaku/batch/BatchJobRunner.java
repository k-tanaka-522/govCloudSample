package jp.lg.kasumidai.yoyaku.batch;

import jp.lg.kasumidai.yoyaku.application.hold.ReleaseExpiredHoldsUseCase;
import jp.lg.kasumidai.yoyaku.application.lottery.ExecuteLotteryUseCase;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * バッチ起動エントリ(EventBridge Scheduler→ECS RunTask=KSM-ADR-008)。
 * 引数 --job=JB-01 --lotteryPeriodId=n(抽選実行)/--job=JB-02(仮押さえ解放)。
 *
 * <p>【P4簡略化宣言】KSM-DDD-001 §6.1はSpring Batch採用とするが、P4時点では
 * ジョブ実行管理テーブル(JobRepository)を伴わないApplicationRunner直接起動とした。
 * 多重起動防止は batch_job_locks+冪等設計で担保(実装完了報告書 乖離一覧 D-2)。
 */
@Component
@Profile("batch")
public class BatchJobRunner implements ApplicationRunner {

  private final ExecuteLotteryUseCase executeLotteryUseCase;
  private final ReleaseExpiredHoldsUseCase releaseExpiredHoldsUseCase;

  public BatchJobRunner(
      ExecuteLotteryUseCase executeLotteryUseCase,
      ReleaseExpiredHoldsUseCase releaseExpiredHoldsUseCase) {
    this.executeLotteryUseCase = executeLotteryUseCase;
    this.releaseExpiredHoldsUseCase = releaseExpiredHoldsUseCase;
  }

  @Override
  public void run(ApplicationArguments args) {
    String job = firstValue(args, "job");
    switch (job) {
      case "JB-01" ->
          executeLotteryUseCase.execute(Long.parseLong(firstValue(args, "lotteryPeriodId")));
      case "JB-02" -> releaseExpiredHoldsUseCase.execute();
      default -> throw new IllegalArgumentException("未定義のジョブID: " + job);
    }
  }

  private String firstValue(ApplicationArguments args, String name) {
    if (!args.containsOption(name) || args.getOptionValues(name).isEmpty()) {
      throw new IllegalArgumentException("起動引数 --" + name + " が必要です");
    }
    return args.getOptionValues(name).get(0);
  }
}
