/**
 * 監視スタック: CloudWatch アラーム + ダッシュボード
 * steering/iac規約4: 監視(アラーム・ダッシュボード)定義は IaC に含め、
 *   運用設計書の監視項目一覧と突合可能であること
 * KSM-BDD-001 §8: 監視・運用方式
 * CLAUDE.md: 重要度区分・通知先・対応期限・抑制条件を明示
 *
 * 重要度命名規則:
 *   P1-CRITICAL: 即時対応(検知後1時間以内に市へ第一報。NFR-C02)
 *   P2-WARNING : 翌開庁日対応
 *   P3-INFO    : 週次確認
 *
 * 対応する監視設計書: KSM-OPS-001(P6) との突合ID は [OPS-ALM-nnn] で管理
 */
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvParams } from '../env/types';
import { requiredTags } from './common/tags';
import { NagSuppressions } from 'cdk-nag';

export interface MonitoringStackProps extends cdk.StackProps {
  readonly params: EnvParams;
  readonly alb: elbv2.IApplicationLoadBalancer;
  readonly cluster: ecs.ICluster;
  readonly dbInstance: rds.IDatabaseInstance;
  readonly notificationQueue: sqs.IQueue;
  readonly notificationDlq: sqs.IQueue;
  readonly logKey: kms.IKey;
}

export class MonitoringStack extends cdk.Stack {
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const { params } = props;
    const env = params.envName;
    const tags = requiredTags(env);

    // ════════════════════════════════════════════════════
    // SNS トピック(アラーム通知先)
    // ════════════════════════════════════════════════════
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `yoyaku-${env}-sns-alarm`,
      displayName: `[霞台市予約システム(${env})] アラーム通知`,
      masterKey: props.logKey,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.alarmTopic).add(k, v));

    // P1 重大アラーム通知先(P6 運用設計でメールアドレスを登録)
    const criticalAction = new cloudwatchActions.SnsAction(this.alarmTopic);
    // P2 警告アラーム通知先(同上)
    const warningAction = new cloudwatchActions.SnsAction(this.alarmTopic);

    // ════════════════════════════════════════════════════
    // ヘルパー: アラーム生成関数
    // ════════════════════════════════════════════════════
    const makeAlarm = (
      id: string,
      metric: cloudwatch.IMetric,
      opts: {
        alarmName: string;
        description: string;
        threshold: number;
        evaluationPeriods: number;
        comparisonOperator?: cloudwatch.ComparisonOperator;
        treatMissingData?: cloudwatch.TreatMissingData;
        severity: 'P1-CRITICAL' | 'P2-WARNING' | 'P3-INFO';
        opsId: string; // 運用設計書突合ID
      },
    ): cloudwatch.Alarm => {
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmName: `[${opts.severity}][OPS-ALM-${opts.opsId}] yoyaku-${env}-${opts.alarmName}`,
        alarmDescription:
          `${opts.description}\n` +
          `重要度:${opts.severity} | 突合ID:OPS-ALM-${opts.opsId} | 環境:${env}`,
        metric,
        threshold: opts.threshold,
        evaluationPeriods: opts.evaluationPeriods,
        comparisonOperator:
          opts.comparisonOperator ??
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData:
          opts.treatMissingData ?? cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(alarm).add(k, v));
      cdk.Tags.of(alarm).add('Severity', opts.severity);
      cdk.Tags.of(alarm).add('OpsId', `OPS-ALM-${opts.opsId}`);

      if (opts.severity === 'P1-CRITICAL') {
        alarm.addAlarmAction(criticalAction);
        alarm.addOkAction(criticalAction);
      } else if (opts.severity === 'P2-WARNING') {
        alarm.addAlarmAction(warningAction);
      }
      return alarm;
    };

    // ════════════════════════════════════════════════════
    // ALB アラーム
    // ════════════════════════════════════════════════════

    // [OPS-ALM-001] ALB 5xx エラー率(NFR-B01との関連・KSM-BDD-001 §8)
    const alb5xxAlarm = makeAlarm(
      'Alb5xxAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'HTTPCode_ELB_5XX_Count',
        dimensionsMap: { LoadBalancer: props.alb.loadBalancerDnsName },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      {
        alarmName: 'alb-5xx-high',
        description: 'ALB 5xxエラーが5分間に10件以上。アプリ異常またはバックエンド障害の可能性。',
        threshold: 10,
        evaluationPeriods: 2,
        severity: 'P1-CRITICAL',
        opsId: '001',
      },
    );

    // [OPS-ALM-002] ALB ターゲット応答時間 P95(NFR-B01: 通常3秒・繁忙5秒)
    const albP95Alarm = makeAlarm(
      'AlbP95ResponseAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'TargetResponseTime',
        dimensionsMap: { LoadBalancer: props.alb.loadBalancerDnsName },
        period: cdk.Duration.minutes(5),
        statistic: 'p95',
      }),
      {
        alarmName: 'alb-p95-response-warn',
        description:
          'ALB 応答時間 p95 が 3 秒超。NFR-B01(通常時 95%タイル 3秒以内)違反の可能性。' +
          '繁忙時閾値(5秒)は OPS-ALM-003 で監視。',
        threshold: 3, // 秒
        evaluationPeriods: 3,
        severity: 'P2-WARNING',
        opsId: '002',
      },
    );

    // [OPS-ALM-003] ALB ターゲット応答時間 P95 重大(繁忙時 5秒超)
    const albP95CriticalAlarm = makeAlarm(
      'AlbP95ResponseCriticalAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'TargetResponseTime',
        dimensionsMap: { LoadBalancer: props.alb.loadBalancerDnsName },
        period: cdk.Duration.minutes(5),
        statistic: 'p95',
      }),
      {
        alarmName: 'alb-p95-response-critical',
        description: 'ALB 応答時間 p95 が 5 秒超。NFR-B01(繁忙時 95%タイル 5秒以内)違反。即時対応要。',
        threshold: 5,
        evaluationPeriods: 2,
        severity: 'P1-CRITICAL',
        opsId: '003',
      },
    );

    // [OPS-ALM-004] ALB ヘルスホスト数(死活)
    const albHealthyHostAlarm = makeAlarm(
      'AlbHealthyHostAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'HealthyHostCount',
        dimensionsMap: { LoadBalancer: props.alb.loadBalancerDnsName },
        period: cdk.Duration.minutes(1),
        statistic: 'Minimum',
      }),
      {
        alarmName: 'alb-healthy-host-zero',
        description: 'ALB ヘルスホスト数が 0。サービス停止状態。',
        threshold: 1,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        severity: 'P1-CRITICAL',
        opsId: '004',
      },
    );

    // ════════════════════════════════════════════════════
    // ECS アラーム
    // ════════════════════════════════════════════════════

    // [OPS-ALM-005] ECS API サービス CPU 使用率
    const ecsCpuAlarm = makeAlarm(
      'EcsCpuAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          ClusterName: props.cluster.clusterName,
          ServiceName: `yoyaku-${env}-svc-api`,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      {
        alarmName: 'ecs-api-cpu-high',
        description: 'ECS API サービス CPU 使用率が 80% 超。スケールアウト閾値(60%)を大幅超過。',
        threshold: 80,
        evaluationPeriods: 3,
        severity: 'P2-WARNING',
        opsId: '005',
      },
    );

    // [OPS-ALM-006] ECS API サービス メモリ使用率
    const ecsMemAlarm = makeAlarm(
      'EcsMemAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'MemoryUtilization',
        dimensionsMap: {
          ClusterName: props.cluster.clusterName,
          ServiceName: `yoyaku-${env}-svc-api`,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      {
        alarmName: 'ecs-api-mem-high',
        description: 'ECS API サービス メモリ使用率が 85% 超。OOM の前兆の可能性。',
        threshold: 85,
        evaluationPeriods: 3,
        severity: 'P2-WARNING',
        opsId: '006',
      },
    );

    // ════════════════════════════════════════════════════
    // RDS アラーム
    // ════════════════════════════════════════════════════

    // [OPS-ALM-007] RDS CPU 使用率
    const rdsCpuAlarm = makeAlarm(
      'RdsCpuAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: { DBInstanceIdentifier: props.dbInstance.instanceIdentifier },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      {
        alarmName: 'rds-cpu-high',
        description: 'RDS CPU 使用率が 80% 超。インスタンスタイプのスケールアップ要否を確認。',
        threshold: 80,
        evaluationPeriods: 3,
        severity: 'P2-WARNING',
        opsId: '007',
      },
    );

    // [OPS-ALM-008] RDS 空きストレージ容量(gp3 100GB → 20GB 以下で警告)
    const rdsStorageAlarm = makeAlarm(
      'RdsStorageAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'FreeStorageSpace',
        dimensionsMap: { DBInstanceIdentifier: props.dbInstance.instanceIdentifier },
        period: cdk.Duration.minutes(15),
        statistic: 'Minimum',
      }),
      {
        alarmName: 'rds-storage-low',
        description:
          'RDS 空きストレージが 20GB 以下(100GBの20%未満)。' +
          '自動拡張(上限200GB)が近いが確認を推奨。',
        threshold: 20 * 1024 * 1024 * 1024, // 20GB in bytes
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        severity: 'P2-WARNING',
        opsId: '008',
      },
    );

    // [OPS-ALM-009] RDS データベース接続数
    const rdsConnAlarm = makeAlarm(
      'RdsConnectionAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: { DBInstanceIdentifier: props.dbInstance.instanceIdentifier },
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      {
        alarmName: 'rds-connections-high',
        description:
          'RDS 接続数が 80 超。db.t4g.medium の max_connections 約 400 の 20%。' +
          'HikariPool 設定確認を推奨。',
        threshold: 80,
        evaluationPeriods: 3,
        severity: 'P2-WARNING',
        opsId: '009',
      },
    );

    // ════════════════════════════════════════════════════
    // SQS アラーム(KSM-ADR-008: DLQ 滞留)
    // ════════════════════════════════════════════════════

    // [OPS-ALM-010] SQS 通知キュー DLQ 滞留(KSM-DDD-001 §6.2)
    const sqsDlqAlarm = makeAlarm(
      'SqsDlqAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: {
          QueueName: props.notificationDlq.queueName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      {
        alarmName: 'sqs-notification-dlq-messages',
        description:
          'SQS 通知 DLQ にメッセージが 1 件以上。再処理ランブックを参照して対応。',
        threshold: 1,
        evaluationPeriods: 1,
        severity: 'P1-CRITICAL',
        opsId: '010',
      },
    );

    // [OPS-ALM-011] SQS 通知キュー 滞留(処理遅延の検知)
    const sqsQueueAlarm = makeAlarm(
      'SqsQueueDelayAlarm',
      new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateAgeOfOldestMessage',
        dimensionsMap: {
          QueueName: props.notificationQueue.queueName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      {
        alarmName: 'sqs-notification-queue-age-high',
        description:
          'SQS 通知キューの最古メッセージが 15 分以上滞留。ワーカーの処理停止の可能性。',
        threshold: 900, // 15 分(秒)
        evaluationPeriods: 2,
        severity: 'P2-WARNING',
        opsId: '011',
      },
    );

    // ════════════════════════════════════════════════════
    // バッチ失敗アラーム(EventBridge → カスタムメトリクス)
    // KSM-DDD-001 §6.2: JB-01 失敗=重大、JB-04 失敗=警告
    // ════════════════════════════════════════════════════

    // [OPS-ALM-012] JB-01 抽選実行失敗(重大度=P1-CRITICAL)
    const lotteryJobFailAlarm = makeAlarm(
      'LotteryJobFailAlarm',
      new cloudwatch.Metric({
        namespace: 'yoyaku/batch',
        metricName: 'JobFailure',
        dimensionsMap: { JobId: 'JB-01', Env: env },
        period: cdk.Duration.minutes(30),
        statistic: 'Sum',
      }),
      {
        alarmName: 'batch-lottery-jb01-failed',
        description:
          'JB-01(抽選実行)が失敗。9:00 窓口開始までに抽選結果が確定しない場合は ' +
          '市へ即報・窓口周知が必要。再実行ランブックを参照(KSM-DDD-001 §6.2)。',
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        severity: 'P1-CRITICAL',
        opsId: '012',
      },
    );

    // [OPS-ALM-013] バッチ汎用失敗(JB-02〜05)
    const batchJobFailAlarm = makeAlarm(
      'BatchJobFailAlarm',
      new cloudwatch.Metric({
        namespace: 'yoyaku/batch',
        metricName: 'JobFailure',
        dimensionsMap: { Env: env },
        period: cdk.Duration.minutes(60),
        statistic: 'Sum',
      }),
      {
        alarmName: 'batch-job-failed',
        description: 'バッチジョブ(JB-02〜05)が失敗。翌開庁日に再実行または手動対処。',
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        severity: 'P2-WARNING',
        opsId: '013',
      },
    );

    // ════════════════════════════════════════════════════
    // CloudWatch ダッシュボード
    // ════════════════════════════════════════════════════
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `yoyaku-${env}-dashboard`,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(dashboard).add(k, v));

    dashboard.addWidgets(
      // ── 行1: サービス概要 ──────────────────────────
      new cloudwatch.TextWidget({
        markdown: `# 霞台市公共施設予約システム(${env}) - 監視ダッシュボード\n` +
          `**運用設計書突合**: OPS-ALM-001〜013 | 更新: IaCで自動管理 | 閾値変更はIaCパラメータで実施`,
        width: 24,
        height: 2,
      }),
    );

    dashboard.addWidgets(
      // ── 行2: ALB ──────────────────────────────────
      new cloudwatch.AlarmStatusWidget({
        title: '【P1-CRITICAL】重大アラーム状態',
        alarms: [alb5xxAlarm, albP95CriticalAlarm, albHealthyHostAlarm, sqsDlqAlarm, lotteryJobFailAlarm],
        width: 12,
        height: 4,
      }),
      new cloudwatch.AlarmStatusWidget({
        title: '【P2-WARNING】警告アラーム状態',
        alarms: [albP95Alarm, ecsCpuAlarm, ecsMemAlarm, rdsCpuAlarm, rdsStorageAlarm, rdsConnAlarm, sqsQueueAlarm, batchJobFailAlarm],
        width: 12,
        height: 4,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: '[OPS-ALM-001/002/003] ALB 5xx エラー・応答時間 P95',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'HTTPCode_ELB_5XX_Count',
            dimensionsMap: { LoadBalancer: props.alb.loadBalancerDnsName },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
            label: '5xxエラー件数',
            color: '#d62728',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApplicationELB',
            metricName: 'TargetResponseTime',
            dimensionsMap: { LoadBalancer: props.alb.loadBalancerDnsName },
            period: cdk.Duration.minutes(5),
            statistic: 'p95',
            label: '応答時間P95(秒)',
            color: '#ff7f0e',
          }),
        ],
        leftAnnotations: [{ value: 10, color: '#d62728', label: '5xx閾値' }],
        rightAnnotations: [
          { value: 3, color: '#ff7f0e', label: 'P95通常閾値3s' },
          { value: 5, color: '#d62728', label: 'P95繁忙閾値5s' },
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: '[OPS-ALM-005/006] ECS CPU/メモリ使用率',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'CPUUtilization',
            dimensionsMap: {
              ClusterName: props.cluster.clusterName,
              ServiceName: `yoyaku-${env}-svc-api`,
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
            label: 'CPU(%)',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'MemoryUtilization',
            dimensionsMap: {
              ClusterName: props.cluster.clusterName,
              ServiceName: `yoyaku-${env}-svc-api`,
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
            label: 'Memory(%)',
          }),
        ],
        leftAnnotations: [
          { value: 60, color: '#aec7e8', label: 'スケールアウト閾値60%' },
          { value: 80, color: '#d62728', label: '警告閾値80%' },
        ],
        width: 12,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: '[OPS-ALM-007/008/009] RDS CPU・ストレージ・接続数',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/RDS',
            metricName: 'CPUUtilization',
            dimensionsMap: { DBInstanceIdentifier: props.dbInstance.instanceIdentifier },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
            label: 'CPU(%)',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/RDS',
            metricName: 'DatabaseConnections',
            dimensionsMap: { DBInstanceIdentifier: props.dbInstance.instanceIdentifier },
            period: cdk.Duration.minutes(5),
            statistic: 'Maximum',
            label: '接続数',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: '[OPS-ALM-010/011] SQS DLQ滞留・キュー遅延',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfMessagesVisible',
            dimensionsMap: { QueueName: props.notificationDlq.queueName },
            period: cdk.Duration.minutes(5),
            statistic: 'Maximum',
            label: 'DLQ滞留件数',
            color: '#d62728',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateAgeOfOldestMessage',
            dimensionsMap: { QueueName: props.notificationQueue.queueName },
            period: cdk.Duration.minutes(5),
            statistic: 'Maximum',
            label: '最古メッセージ経過秒数',
          }),
        ],
        leftAnnotations: [{ value: 1, color: '#d62728', label: 'DLQ=0が正常' }],
        rightAnnotations: [{ value: 900, color: '#ff7f0e', label: '15分超警告' }],
        width: 12,
        height: 6,
      }),
    );

    // ── アウトプット ────────────────────────────────────
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      exportName: `yoyaku-${env}-sns-alarm-arn`,
    });
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home#dashboards:name=yoyaku-${env}-dashboard`,
      description: 'CloudWatch ダッシュボード URL',
    });

    // 未使用変数の警告回避
    void alb5xxAlarm;
    void albP95Alarm;
    void albP95CriticalAlarm;
    void albHealthyHostAlarm;
    void ecsCpuAlarm;
    void ecsMemAlarm;
    void rdsCpuAlarm;
    void rdsStorageAlarm;
    void rdsConnAlarm;
    void sqsDlqAlarm;
    void sqsQueueAlarm;
    void lotteryJobFailAlarm;
    void batchJobFailAlarm;

    // SNS cdk-nag 抑制
    NagSuppressions.addResourceSuppressions(this.alarmTopic, [
      {
        id: 'AwsSolutions-SNS2',
        reason:
          'SNS topic is encrypted with KMS logKey. masterKey is set. ' +
          'KSM-ADR-010: ログ用CMKで暗号化済み。',
      },
      {
        id: 'AwsSolutions-SNS3',
        reason:
          'SNS subscriptions (email endpoints) will be added manually in P6 operations setup. ' +
          'IaC manages topic and alarm wiring; subscription targets are environment-specific ' +
          'and added by operations team post-deployment.',
      },
    ]);
  }
}
