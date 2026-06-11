/**
 * 検証環境パラメータ(KSM-DDD-001 §8。環境差分はパラメータ管理=steering/iac規約1)
 * 検証環境はシングルAZ・縮退スペックでコスト最小化(KSM-ADR-005、BDD-001 §11.1)
 */
import { EnvParams, validateParams } from './types';

export const stgParams: EnvParams = validateParams({
  envName: 'stg',
  // 検証環境ではドメイン未取得のため domainName/certificateArn は未設定
  // CloudFront デフォルトドメイン(*.cloudfront.net)で動作する
  // 【コスト統制 KSM-ENV-001 §4】stg 最小構成:
  //   - RDS: シングルAZ・db.t4g.small(KSM-ADR-005)
  //   - Fargate: desiredCount=1・maxCount=2
  //   - NAT GW: 1個(network-stack.ts で prod:2/stg:1 の分岐済み)
  //   - WAF: 維持(NFR-E05)
  cloudFrontPrefixListId: 'pl-58a04531', // ap-northeast-1 com.amazonaws.global.cloudfront.origin-facing
  // Build 17 (2026-06-11) で ECR イメージプッシュ済み。ECS サービス稼働中(KSM-ENV-001 §5)
  apiDesiredCount: 1,
  apiMaxCount: 2,
  rdsMultiAz: false, // 検証はシングルAZ(KSM-ADR-005)
  availabilityCacheTtlSec: 60,
  passwordMinLength: 12,
  // 検証環境はIP制限を緩和(受注者開発拠点からの接続を許可)
  staffAllowedCidrs: ['0.0.0.0/0'], // stg: 制限なし(開発・テスト目的)
  lotteryWarmup: null, // 検証環境は暖機スケジュールなし
  imageTag: 'latest',
});
