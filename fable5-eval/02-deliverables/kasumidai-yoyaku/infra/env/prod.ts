/**
 * 本番環境パラメータ(KSM-DDD-001 §8。環境差分はパラメータ管理=steering/iac規約1)
 * QA No.17 回答(霞情政第201号)より確定した14拠点IPを設定済み。
 */
import { EnvParams, validateParams } from './types';

export const prodParams: EnvParams = validateParams({
  envName: 'prod',
  domainName: 'yoyaku.city.kasumidai.lg.jp',
  // ACM証明書ARN: us-east-1(CloudFront用)。証明書はACMで発行・自動更新(KSM-BDD-001 §4.3)
  // 実際のARNはデプロイ前に差し替え(GCAS環境構築後に取得)
  certificateArn: 'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/REPLACE_WITH_ACTUAL_ARN',
  // CloudFrontマネージドプレフィックスリスト(ALB SGの許可元)
  cloudFrontPrefixListId: 'pl-3b927c52', // ap-northeast-1
  apiDesiredCount: 2,
  apiMaxCount: 8,
  rdsMultiAz: true,
  availabilityCacheTtlSec: 60,
  passwordMinLength: 12,
  /**
   * 職員アクセス許可IP(NFR-E08。QA No.17回答=霞情政第201号で受領済み)
   * 14拠点:本庁舎1拠点 + 市直営有人施設10拠点 + 指定管理者3者
   * 回線変更時は市から文書で変更連絡→受領後5営業日以内にIaCパラメータ反映(KSM-DDD-001 §8.2)
   */
  staffAllowedCidrs: [
    '203.0.113.8/29',   // 本庁舎(1拠点)
    '198.51.100.11/32', // 中央公民館
    '198.51.100.12/32', // 地区公民館1
    '198.51.100.13/32', // 地区公民館2
    '198.51.100.14/32', // 地区公民館3
    '198.51.100.15/32', // 地区公民館4
    '198.51.100.16/32', // 地区公民館5
    '198.51.100.17/32', // 地区公民館6
    '198.51.100.18/32', // 地区公民館7
    '198.51.100.19/32', // 図書館分室窓口
    '198.51.100.20/32', // 市民プール管理棟
    '192.0.2.33/32',    // 指定管理者1 本部事務所
    '192.0.2.65/32',    // 指定管理者2 本部事務所
    '192.0.2.97/32',    // 指定管理者3 本部事務所
  ],
  lotteryWarmup: {
    // 抽選申込期間(毎月1〜7日) 8:45に4タスクへ事前暖機(KSM-BDD-001 §7.1、KSM-ADR-001)
    cron: 'cron(45 8 1-7 * ? *)',
    taskCount: 4,
  },
  imageTag: 'latest',
});
