/**
 * 環境別パラメータの型(KSM-DDD-001 1.1版 §8。環境差分はパラメータ管理=steering/iac規約1、
 * コード分岐・環境ブランチ・ディレクトリ複製は禁止=KSM-ADR-007)。
 */
export interface EnvParams {
  /** 環境名(リソース名 yoyaku-{env}-{role} の env 部=steering/iac規約2)。 */
  readonly envName: 'dev' | 'stg' | 'prod';
  /** 公開ドメイン(QA No.20:DNS委任・SES認証は市側登録完了)。検証環境でドメイン未取得の場合は undefined。 */
  readonly domainName?: string;
  /**
   * ACM証明書ARN(us-east-1。CloudFront用)。
   * 検証環境でドメイン未取得の場合は undefined。
   * undefined の場合は CloudFront デフォルトドメイン(*.cloudfront.net)で動作する。
   */
  readonly certificateArn?: string;
  /** CloudFront origin-facing マネージドプレフィックスリストID(ALB SGの許可元)。 */
  readonly cloudFrontPrefixListId: string;
  /** APIサービスの常時タスク数/最大タスク数(KSM-BDD-001 §3.1)。 */
  readonly apiDesiredCount: number;
  readonly apiMaxCount: number;
  /** RDS構成(KSM-ADR-005)。 */
  readonly rdsMultiAz: boolean;
  /** 空き照会キャッシュTTL秒(KSM-ADR-009:30〜120秒で調整可)。 */
  readonly availabilityCacheTtlSec: number;
  /** 利用者パスワードポリシー最小桁数(NFR-E02。G2残課題5:市了承=IaCパラメータ変更管理)。 */
  readonly passwordMinLength: number;
  /**
   * 職員アクセス許可IP(NFR-E08。QA No.17:霞情政第201号の14拠点)。
   * prod環境で空のままのデプロイは synth エラーとする(適用漏れ防止=KSM-DDD-001 §8.2)。
   */
  readonly staffAllowedCidrs: string[];
  /** 抽選日暖機スケジュール(毎月1〜7日 8:45に4タスク=KSM-BDD-001 §7.1)。null=なし。 */
  readonly lotteryWarmup: { readonly cron: string; readonly taskCount: number } | null;
  /** デプロイするコンテナイメージタグ(同一アーティファクト昇格=KSM-REP-001 §3)。 */
  readonly imageTag: string;
}

/** prod環境の必須検証(KSM-DDD-001 §8.2:恒久の安全装置)。 */
export const validateParams = (params: EnvParams): EnvParams => {
  if (params.envName === 'prod' && params.staffAllowedCidrs.length === 0) {
    throw new Error(
      'prod環境では staffAllowedCidrs(職員アクセス許可IP)の設定が必須です(NFR-E08/QA No.17)',
    );
  }
  return params;
};
