package jp.lg.kasumidai.yoyaku.infrastructure.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;

/**
 * AWS SDK v2 クライアント Bean 定義。
 * Spring Boot は AWS SDK v2 の自動構成を提供しないため、明示的に Bean 定義が必要。
 * ECS タスクロール (yoyaku-{env}-role-ecs-task) の IAM 認証情報は
 * DefaultCredentialsProvider が IMDS (Instance Metadata Service) 経由で自動取得する。
 * (KSM-DEV-002 S-42: 認証情報ハードコード禁止。IAMロールベース認証)
 */
@Configuration
public class AwsConfig {

  /**
   * SQS クライアント Bean。
   * リージョンは ap-northeast-1 固定(KSM-ADR-001 §2: 東京リージョン単一デプロイ)。
   */
  @Bean
  public SqsClient sqsClient() {
    return SqsClient.builder()
        .region(Region.AP_NORTHEAST_1)
        .credentialsProvider(DefaultCredentialsProvider.create())
        .build();
  }
}
