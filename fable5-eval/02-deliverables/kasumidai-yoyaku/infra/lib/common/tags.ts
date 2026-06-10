/**
 * 必須タグ定義(steering/iac規約2)
 * 全リソースに Project / Env / ManagedBy / CostCenter を付与する
 */

export type EnvName = 'prod' | 'stg' | 'dev';

export interface RequiredTags {
  readonly Project: string;
  readonly Env: string;
  readonly ManagedBy: string;
  readonly CostCenter: string;
}

/**
 * steering/iac規約2 に定める必須タグを返す。
 * 命名規則 `yoyaku-{env}-{role}` と組み合わせてリソースに適用する。
 */
export const requiredTags = (env: EnvName): RequiredTags => ({
  Project: 'kasumidai-yoyaku',
  Env: env,
  ManagedBy: 'cdk',
  CostCenter: 'jouhou-seisaku',
});
