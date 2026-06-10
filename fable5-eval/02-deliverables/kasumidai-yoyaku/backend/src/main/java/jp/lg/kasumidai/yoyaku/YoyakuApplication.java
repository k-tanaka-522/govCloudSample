package jp.lg.kasumidai.yoyaku;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 霞台市公共施設予約管理システム バックエンド(Java 21 + Spring Boot 3)。
 * API・ワーカー・バッチは単一コードベースを起動プロファイルで使い分ける(KSM-ADR-001/008):
 * api(既定)/worker(SQS消費)/batch(JB-01〜05。引数でジョブ指定)。
 */
@SpringBootApplication
public class YoyakuApplication {

  public static void main(String[] args) {
    SpringApplication.run(YoyakuApplication.class, args);
  }
}
