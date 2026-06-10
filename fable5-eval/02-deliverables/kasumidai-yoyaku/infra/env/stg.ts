/**
 * 検証環境パラメータ(KSM-DDD-001 §8。環境差分はパラメータ管理=steering/iac規約1)
 * 検証環境はシングルAZ・縮退スペックでコスト最小化(KSM-ADR-005、BDD-001 §11.1)
 */
import { EnvParams, validateParams } from './types';

export const stgParams: EnvParams = validateParams({
  envName: 'stg',
  domainName: 'stg.yoyaku.city.kasumidai.lg.jp',
  // 検証環境ACM証明書(us-east-1)
  certificateArn: 'arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/REPLACE_WITH_STG_ARN',
  cloudFrontPrefixListId: 'pl-3b927c52', // ap-northeast-1
  apiDesiredCount: 1,
  apiMaxCount: 2,
  rdsMultiAz: false, // 検証はシングルAZ(KSM-ADR-005)
  availabilityCacheTtlSec: 60,
  passwordMinLength: 12,
  // 検証環境はIP制限を緩和(受注者開発拠点からの接続を許可)
  // 実際の検証環境CIDRはデプロイ時に設定
  staffAllowedCidrs: ['0.0.0.0/0'], // stg: 制限なし(開発・テスト目的)
  lotteryWarmup: null, // 検証環境は暖機スケジュールなし
  imageTag: 'latest',
});
