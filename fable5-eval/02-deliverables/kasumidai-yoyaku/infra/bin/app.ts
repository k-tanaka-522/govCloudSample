#!/usr/bin/env node
/**
 * CDK エントリポイント
 * 環境はコンテキスト `env` で切り替え(コード分岐禁止=steering/iac規約1)
 *   cdk synth --context env=prod  → 本番
 *   cdk synth --context env=stg   → 検証
 *   cdk synth                      → dev(cdk.json デフォルト)
 *
 * スタック構成(KSM-ADR-006: ステートフル独立スタック分離):
 *   1. NetworkStack   : VPC・SG
 *   2. StatefulStack  : KMS・RDS・Cognito・S3(ステートフルリソース。削除保護有効)
 *   3. AppStack       : ECR・ECS Fargate・ALB・SQS・EventBridge
 *   4. DeliveryStack  : CloudFront・WAF・S3(SPA) ※us-east-1
 *   5. MonitoringStack: CloudWatch アラーム・ダッシュボード
 */
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { StatefulStack } from '../lib/stateful-stack';
import { PipelineStack } from '../lib/pipeline-stack';
import { AppStack } from '../lib/app-stack';
import { DeliveryStack } from '../lib/delivery-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { prodParams } from '../env/prod';
import { stgParams } from '../env/stg';
import { EnvParams } from '../env/types';

const app = new cdk.App();

// ── cdk-nag AwsSolutions チェックを全スタックに適用(品質ゲート) ──
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// ── 環境コンテキストの取得(コード分岐禁止=steering/iac規約1) ──────
const envContext = app.node.tryGetContext('env') as string | undefined;

let params: EnvParams;
switch (envContext) {
  case 'prod':
    params = prodParams;
    break;
  case 'stg':
    params = stgParams;
    break;
  default:
    // dev: ダミーパラメータ(cdk synth 実行・型検査用。実際のデプロイは prod/stg のみ)
    params = {
      envName: 'dev',
      domainName: 'dev.yoyaku.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/dummy-dev',
      cloudFrontPrefixListId: 'pl-3b927c52',
      apiDesiredCount: 1,
      apiMaxCount: 2,
      rdsMultiAz: false,
      availabilityCacheTtlSec: 60,
      passwordMinLength: 8,
      staffAllowedCidrs: ['10.0.0.0/8'], // dev: ローカルネットワークのみ
      lotteryWarmup: null,
      imageTag: 'latest',
    };
    break;
}

const env = { region: 'ap-northeast-1', account: process.env.CDK_DEFAULT_ACCOUNT };
const envName = params.envName;

// ── 1. ネットワークスタック ────────────────────────────────────────
const networkStack = new NetworkStack(app, `yoyaku-${envName}-network`, {
  env,
  params,
  stackName: `yoyaku-${envName}-network`,
  description: `霞台市公共施設予約システム(${envName}) - ネットワーク(VPC・SG)`,
});

// ── 2. ステートフルスタック(独立スタック+削除保護) ────────────────
const statefulStack = new StatefulStack(app, `yoyaku-${envName}-stateful`, {
  env,
  params,
  vpc: networkStack.vpc,
  dbSg: networkStack.dbSg,
  stackName: `yoyaku-${envName}-stateful`,
  description: `霞台市公共施設予約システム(${envName}) - ステートフル(KMS・RDS・Cognito・S3)`,
});
statefulStack.addDependency(networkStack);

// ── 3. パイプラインスタック(ECR + CodeBuild CI) ───────────────────
// 【制度判断】CodeCommit は 2024年7月以降、新規顧客の利用が停止されている。
// 代替として CodeBuild の GitHub ソース(公開リポジトリ直接参照)を使用する。
// 参照: https://docs.aws.amazon.com/codecommit/latest/userguide/limits.html
const pipelineStack = new PipelineStack(app, `yoyaku-${envName}-pipeline`, {
  env,
  params,
  dataKey: statefulStack.dataKey,
  logKey: statefulStack.logKey,
  stackName: `yoyaku-${envName}-pipeline`,
  description: `霞台市公共施設予約システム(${envName}) - パイプライン(ECR・CodeBuild CI)`,
});
pipelineStack.addDependency(statefulStack);

// ── 4. アプリスタック ─────────────────────────────────────────────
const appStack = new AppStack(app, `yoyaku-${envName}-app`, {
  env,
  params,
  vpc: networkStack.vpc,
  albSg: networkStack.albSg,
  appSg: networkStack.appSg,
  dataKey: statefulStack.dataKey,
  logKey: statefulStack.logKey,
  dbSecretArn: statefulStack.dbSecret.secretArn,
  // RDS エンドポイントは JDBC URL 組み立てに使用(KSM-ENV-001 §5)
  dbEndpoint: statefulStack.dbInstance.dbInstanceEndpointAddress,
  dbName: 'yoyakudb',
  dataBucketName: statefulStack.dataS3.bucketName,
  logBucketName: statefulStack.logS3.bucketName,
  stackName: `yoyaku-${envName}-app`,
  description: `霞台市公共施設予約システム(${envName}) - アプリ(ECS Fargate・ALB・SQS・EventBridge)`,
});
appStack.addDependency(statefulStack);

// ── 5. 配信スタック(CloudFront + WAF) ────────────────────────────
// NOTE: DeliveryStack は CloudFront 用 WAF を含むため us-east-1 での作成が必要。
// ただし CDK では同一アカウント内の他リージョンスタックを通常の方法で参照できる。
// WAF を us-east-1 で分離する場合は Cross-Region Ref が必要だが、
// ここでは CloudFront 配下の WAF は同スタックで管理し、ap-northeast-1 で synth する
// (WAF scope=CLOUDFRONT は us-east-1 でのみ作成可能だが、CDK の CfnWebACL は
//  env: { region: 'us-east-1' } のスタックで作成する必要がある)
// 本実装では DeliveryStack を us-east-1 スタックとして宣言する
const deliveryStack = new DeliveryStack(app, `yoyaku-${envName}-delivery`, {
  env: { region: 'us-east-1', account: process.env.CDK_DEFAULT_ACCOUNT },
  params,
  alb: appStack.alb,
  logBucketName: statefulStack.logS3.bucketName,
  stackName: `yoyaku-${envName}-delivery`,
  description: `霞台市公共施設予約システム(${envName}) - 配信(CloudFront・WAF・S3-SPA)`,
});
deliveryStack.addDependency(appStack);

// ── 6. 監視スタック ────────────────────────────────────────────────
const monitoringStack = new MonitoringStack(app, `yoyaku-${envName}-monitoring`, {
  env,
  params,
  alb: appStack.alb,
  cluster: appStack.cluster,
  dbInstance: statefulStack.dbInstance,
  notificationQueue: appStack.notificationQueue,
  notificationDlq: appStack.notificationDlq,
  logKey: statefulStack.logKey,
  stackName: `yoyaku-${envName}-monitoring`,
  description: `霞台市公共施設予約システム(${envName}) - 監視(CloudWatchアラーム・ダッシュボード)`,
});
monitoringStack.addDependency(appStack);

void pipelineStack;
void deliveryStack;
void monitoringStack;

app.synth();
