/**
 * アプリスタック: ALB + ECS Fargate(API/Worker/Batch) + ECR + SQS + EventBridge
 * KSM-ADR-001(ECS Fargate 2AZ 自動スケール2〜8)
 * KSM-ADR-008(SQS+DLQ・EventBridge Scheduler)
 * KSM-BDD-001 §3.1 準拠
 */
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';
import { EnvParams } from '../env/types';
import { requiredTags } from './common/tags';
import { NagSuppressions } from 'cdk-nag';

export interface AppStackProps extends cdk.StackProps {
  readonly params: EnvParams;
  readonly vpc: ec2.IVpc;
  readonly albSg: ec2.ISecurityGroup;
  readonly appSg: ec2.ISecurityGroup;
  readonly dataKey: kms.IKey;
  readonly logKey: kms.IKey;
  /** DB認証情報の SecretArn(循環参照回避のため ARN 文字列で受け取る) */
  readonly dbSecretArn: string;
  readonly dataBucketName: string;
  readonly logBucketName: string;
}

export class AppStack extends cdk.Stack {
  /** ECR リポジトリ */
  public readonly repository: ecr.Repository;
  /** ECS クラスター */
  public readonly cluster: ecs.Cluster;
  /** ALB */
  public readonly alb: elbv2.ApplicationLoadBalancer;
  /** 通知 SQS キュー */
  public readonly notificationQueue: sqs.Queue;
  /** 通知 SQS DLQ */
  public readonly notificationDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { params, vpc, albSg, appSg, dataKey, logKey } = props;
    // DB認証情報を ARN から参照(循環参照回避: StatefulStack→AppStack の依存方向を一方向に保つ)
    const dbSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this, 'DbSecretRef', props.dbSecretArn,
    );
    const env = params.envName;
    const tags = requiredTags(env);

    // ════════════════════════════════════════════════════
    // ECR リポジトリ
    // ════════════════════════════════════════════════════
    this.repository = new ecr.Repository(this, 'AppRepository', {
      repositoryName: `yoyaku-${env}-ecr-app`,
      imageScanOnPush: true,      // プッシュ時に脆弱性スキャン(KSM-DEV-001 §7)
      imageTagMutability: ecr.TagMutability.MUTABLE,
      encryptionKey: dataKey,
      lifecycleRules: [
        {
          rulePriority: 1,
          description: 'Keep last 10 images',
          maxImageCount: 10,
          tagStatus: ecr.TagStatus.ANY,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.repository).add(k, v));

    // ════════════════════════════════════════════════════
    // SQS 通知キュー + DLQ(KSM-ADR-008)
    // ════════════════════════════════════════════════════
    this.notificationDlq = new sqs.Queue(this, 'NotificationDlq', {
      queueName: `yoyaku-${env}-queue-notification-dlq`,
      encryptionMasterKey: dataKey,
      retentionPeriod: cdk.Duration.days(14), // DLQ は 14日保持
      enforceSSL: true, // AwsSolutions-SQS4: SSL必須
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.notificationDlq).add(k, v));

    this.notificationQueue = new sqs.Queue(this, 'NotificationQueue', {
      queueName: `yoyaku-${env}-queue-notification`,
      encryptionMasterKey: dataKey,
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(4),
      enforceSSL: true,
      deadLetterQueue: {
        queue: this.notificationDlq,
        maxReceiveCount: 3, // 最大3回再試行→DLQ(KSM-DDD-001 §6.2)
      },
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.notificationQueue).add(k, v));

    // 決済結果キュー + DLQ(KSM-ADR-008 WK-02)
    const paymentDlq = new sqs.Queue(this, 'PaymentDlq', {
      queueName: `yoyaku-${env}-queue-payment-dlq`,
      encryptionMasterKey: dataKey,
      retentionPeriod: cdk.Duration.days(14),
      enforceSSL: true,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(paymentDlq).add(k, v));

    const paymentQueue = new sqs.Queue(this, 'PaymentQueue', {
      queueName: `yoyaku-${env}-queue-payment`,
      encryptionMasterKey: dataKey,
      visibilityTimeout: cdk.Duration.seconds(300),
      enforceSSL: true,
      deadLetterQueue: {
        queue: paymentDlq,
        maxReceiveCount: 3,
      },
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(paymentQueue).add(k, v));

    // ════════════════════════════════════════════════════
    // ECS クラスター
    // ════════════════════════════════════════════════════
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `yoyaku-${env}-cluster`,
      vpc,
      containerInsights: true, // ECS Container Insights 有効化
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.cluster).add(k, v));

    // ════════════════════════════════════════════════════
    // IAM タスクロール(最小権限。steering/iac規約3)
    // ════════════════════════════════════════════════════
    const taskRole = new iam.Role(this, 'AppTaskRole', {
      roleName: `yoyaku-${env}-role-ecs-task`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS task role for yoyaku app',
    });
    // Secrets Manager 読み取り(DB認証情報)
    dbSecret.grantRead(taskRole);
    // SQS キューへの送受信
    this.notificationQueue.grantSendMessages(taskRole);
    this.notificationQueue.grantConsumeMessages(taskRole);
    paymentQueue.grantSendMessages(taskRole);
    paymentQueue.grantConsumeMessages(taskRole);
    // S3 データバケット読み書き
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
      resources: [
        `arn:aws:s3:::${props.dataBucketName}`,
        `arn:aws:s3:::${props.dataBucketName}/*`,
      ],
    }));
    // KMS 使用権限(データ暗号化)
    dataKey.grantEncryptDecrypt(taskRole);
    // ECS Exec 用(SSH/RDP の代替。監査ログ付きデバッグアクセス)
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ssmmessages:CreateControlChannel',
        'ssmmessages:CreateDataChannel',
        'ssmmessages:OpenControlChannel',
        'ssmmessages:OpenDataChannel',
      ],
      resources: ['*'],
    }));
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(taskRole).add(k, v));

    // タスク実行ロール(ECR プル・CloudWatch Logs 書き込み)
    const executionRole = new iam.Role(this, 'AppExecutionRole', {
      roleName: `yoyaku-${env}-role-ecs-exec`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy',
        ),
      ],
    });
    dbSecret.grantRead(executionRole);
    dataKey.grantDecrypt(executionRole);
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(executionRole).add(k, v));

    // cdk-nag 抑制: ECS Exec は SSM への *, ワイルドカード Resource だが
    // SSM Session Manager はリソース指定不可の AWS 既定動作
    // applyToChildren=true で DefaultPolicy/Resource まで適用
    NagSuppressions.addResourceSuppressions(taskRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'SSM Session Manager requires Resource: * for ssmmessages actions. ' +
          'This is the AWS-documented pattern for ECS Exec (SSH/RDP代替). ' +
          'KMS GenerateDataKey*/ReEncrypt* are standard patterns for KMS grantEncryptDecrypt. ' +
          'S3 /* is required for object-level operations on the data bucket. ' +
          'steering/iac規約3: 人(SSH/RDP禁止)とワークロードロールを分離済み。',
        appliesTo: [
          'Resource::*',
          'Action::kms:GenerateDataKey*',
          'Action::kms:ReEncrypt*',
          // S3 データバケット: CFN参照形式(クロススタック参照のためlogical IDは動的)
          { regex: '/^Resource::arn:aws:s3:::.*\\/*$/' },
        ],
      },
    ], true); // applyToChildren=true でインラインポリシーにも適用

    NagSuppressions.addResourceSuppressions(executionRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'AmazonECSTaskExecutionRolePolicy is the standard AWS-managed policy for ECS task ' +
          'execution role (ECR pull, CloudWatch Logs write). ' +
          'This is the AWS-recommended pattern and cannot be replaced with narrower permissions ' +
          'without reimplementing the same actions. ' +
          'steering/iac規約3: 人(コンソール操作)とワークロードロール(ECS実行)を分離済み。',
        appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'],
      },
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'ECS task execution role: KMS Decrypt/* and ECR/* are required for task startup. ' +
          'These are CDK-generated policies from grantDecrypt() and standard execution role patterns.',
        appliesTo: ['Resource::*', 'Action::kms:GenerateDataKey*', 'Action::kms:ReEncrypt*'],
      },
    ], true); // applyToChildren=true でインラインポリシーにも適用

    // ════════════════════════════════════════════════════
    // CloudWatch Logs グループ(ECS タスク用)
    // ════════════════════════════════════════════════════
    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/yoyaku/${env}/ecs/api`,
      encryptionKey: logKey,
      retention: env === 'prod' ? logs.RetentionDays.ONE_YEAR : logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(apiLogGroup).add(k, v));

    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      logGroupName: `/yoyaku/${env}/ecs/worker`,
      encryptionKey: logKey,
      retention: env === 'prod' ? logs.RetentionDays.ONE_YEAR : logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(workerLogGroup).add(k, v));

    const batchLogGroup = new logs.LogGroup(this, 'BatchLogGroup', {
      logGroupName: `/yoyaku/${env}/ecs/batch`,
      encryptionKey: logKey,
      retention: env === 'prod' ? logs.RetentionDays.ONE_YEAR : logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(batchLogGroup).add(k, v));

    // ════════════════════════════════════════════════════
    // ECS タスク定義: API サービス(Webアプリ)
    // ════════════════════════════════════════════════════
    const apiTaskDef = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
      family: `yoyaku-${env}-task-api`,
      cpu: 512,     // 0.5 vCPU(KSM-BDD-001 §3.1)
      memoryLimitMiB: 1024, // 1 GB
      taskRole,
      executionRole,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(apiTaskDef).add(k, v));

    apiTaskDef.addContainer('ApiContainer', {
      containerName: `yoyaku-${env}-app`,
      image: ecs.ContainerImage.fromEcrRepository(this.repository, params.imageTag),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        SPRING_PROFILES_ACTIVE: 'api',
        ENV_NAME: env,
        NOTIFICATION_QUEUE_URL: this.notificationQueue.queueUrl,
        PAYMENT_QUEUE_URL: paymentQueue.queueUrl,
        DATA_BUCKET: props.dataBucketName,
        AVAILABILITY_CACHE_TTL_SEC: String(params.availabilityCacheTtlSec),
      },
      secrets: {
        SPRING_DATASOURCE_URL: ecs.Secret.fromSecretsManager(dbSecret, 'host'),
        SPRING_DATASOURCE_USERNAME: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        SPRING_DATASOURCE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'api',
        logGroup: apiLogGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/actuator/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // ════════════════════════════════════════════════════
    // ALB(Application Load Balancer)
    // ════════════════════════════════════════════════════
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: `yoyaku-${env}-alb`,
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      deletionProtection: env === 'prod',
    });
    // ALBアクセスログ(S3 ログバケットへ)
    this.alb.logAccessLogs(
      cdk.aws_s3.Bucket.fromBucketName(this, 'LogBucketRef', props.logBucketName),
      `alb/${env}`,
    );
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.alb).add(k, v));

    // HTTP → HTTPS リダイレクト(steering/iac規約3)
    this.alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    // HTTPS リスナー
    const httpsListener = this.alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [
        elbv2.ListenerCertificate.fromArn(params.certificateArn),
      ],
      sslPolicy: elbv2.SslPolicy.TLS12_EXT, // TLS1.2以上(KSM-BDD-001 §4.3)
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'application/json',
        messageBody: '{"error":"not found"}',
      }),
    });

    // ALB cdk-nag 抑制
    NagSuppressions.addResourceSuppressions(this.alb, [
      {
        id: 'AwsSolutions-ELB2',
        reason:
          'ALB access logs are enabled and sent to S3 log bucket. ' +
          'logAccessLogs() is called with log bucket.',
      },
    ]);

    // ════════════════════════════════════════════════════
    // ECS Fargate サービス: API(2AZ・自動スケール 2〜8)
    // ════════════════════════════════════════════════════
    const apiService = new ecs.FargateService(this, 'ApiService', {
      serviceName: `yoyaku-${env}-svc-api`,
      cluster: this.cluster,
      taskDefinition: apiTaskDef,
      desiredCount: params.apiDesiredCount,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [appSg],
      assignPublicIp: false,
      enableExecuteCommand: true, // ECS Exec 有効化(SSH/RDP代替)
      circuitBreaker: { rollback: true }, // デプロイ失敗時の自動ロールバック
      minHealthyPercent: 100, // ローリングデプロイで無停止(KSM-BDD-001 §5.1)
      maxHealthyPercent: 200,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(apiService).add(k, v));

    // ALB ターゲットグループ
    const targetGroup = httpsListener.addTargets('ApiTargets', {
      targetGroupName: `yoyaku-${env}-tg-api`,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
      healthCheck: {
        path: '/actuator/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Auto Scaling(KSM-ADR-001: CPU 60%ターゲット追跡)
    const scaling = apiService.autoScaleTaskCount({
      minCapacity: params.apiDesiredCount,
      maxCapacity: params.apiMaxCount,
    });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // 抽選日暖機スケジュールスケーリング(KSM-BDD-001 §7.1)
    if (params.lotteryWarmup !== null) {
      const warmup = params.lotteryWarmup;
      const scaleTarget = new applicationautoscaling.ScalableTarget(this, 'LotteryWarmupTarget', {
        serviceNamespace: applicationautoscaling.ServiceNamespace.ECS,
        resourceId: `service/${this.cluster.clusterName}/${apiService.serviceName}`,
        scalableDimension: 'ecs:service:DesiredCount',
        minCapacity: params.apiDesiredCount,
        maxCapacity: params.apiMaxCount,
      });
      scaleTarget.scaleOnSchedule('LotteryWarmupScale', {
        schedule: applicationautoscaling.Schedule.expression(warmup.cron),
        minCapacity: warmup.taskCount,
        maxCapacity: params.apiMaxCount,
      });
    }

    // ════════════════════════════════════════════════════
    // ECS タスク定義: Worker(非同期ワーカー・常駐1タスク)
    // KSM-ADR-008: SQS→WK-01(通知)・WK-02(決済結果消込)
    // ════════════════════════════════════════════════════
    const workerTaskDef = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
      family: `yoyaku-${env}-task-worker`,
      cpu: 256,
      memoryLimitMiB: 512,
      taskRole,
      executionRole,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(workerTaskDef).add(k, v));

    workerTaskDef.addContainer('WorkerContainer', {
      containerName: `yoyaku-${env}-worker`,
      image: ecs.ContainerImage.fromEcrRepository(this.repository, params.imageTag),
      environment: {
        SPRING_PROFILES_ACTIVE: 'worker',
        ENV_NAME: env,
        NOTIFICATION_QUEUE_URL: this.notificationQueue.queueUrl,
        PAYMENT_QUEUE_URL: paymentQueue.queueUrl,
        DATA_BUCKET: props.dataBucketName,
      },
      secrets: {
        SPRING_DATASOURCE_URL: ecs.Secret.fromSecretsManager(dbSecret, 'host'),
        SPRING_DATASOURCE_USERNAME: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        SPRING_DATASOURCE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'worker',
        logGroup: workerLogGroup,
      }),
    });

    const workerService = new ecs.FargateService(this, 'WorkerService', {
      serviceName: `yoyaku-${env}-svc-worker`,
      cluster: this.cluster,
      taskDefinition: workerTaskDef,
      desiredCount: 1, // 常駐1タスク(KSM-ADR-008)
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [appSg],
      assignPublicIp: false,
      enableExecuteCommand: true,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(workerService).add(k, v));

    // ════════════════════════════════════════════════════
    // ECS タスク定義: Batch(RunTask 随時起動。KSM-ADR-008)
    // ════════════════════════════════════════════════════
    const batchTaskDef = new ecs.FargateTaskDefinition(this, 'BatchTaskDef', {
      family: `yoyaku-${env}-task-batch`,
      cpu: 1024,   // バッチは一時的に CPU を多く使用(抽選2,000〜2,500件処理)
      memoryLimitMiB: 2048,
      taskRole,
      executionRole,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(batchTaskDef).add(k, v));

    batchTaskDef.addContainer('BatchContainer', {
      containerName: `yoyaku-${env}-batch`,
      image: ecs.ContainerImage.fromEcrRepository(this.repository, params.imageTag),
      environment: {
        SPRING_PROFILES_ACTIVE: 'batch',
        ENV_NAME: env,
        NOTIFICATION_QUEUE_URL: this.notificationQueue.queueUrl,
        DATA_BUCKET: props.dataBucketName,
      },
      secrets: {
        SPRING_DATASOURCE_URL: ecs.Secret.fromSecretsManager(dbSecret, 'host'),
        SPRING_DATASOURCE_USERNAME: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        SPRING_DATASOURCE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'batch',
        logGroup: batchLogGroup,
      }),
    });

    // ECS Task Definition の environment 変数 nag 抑制(AwsSolutions-ECS2)
    // 秘匿情報(DB認証情報・決済APIキー)はすべて Secrets Manager から注入(上記 secrets: 節)。
    // environment: 節は非秘匿の設定値(キューURL・バケット名・プロファイル名等)のみ。
    // これらをパラメータストアに移動すると起動時のAPI呼び出しが増え、
    // 0.5人月/月の運用体制で管理負荷が増大する。D-5(適正水準の原則)により現状を許容。
    [apiTaskDef, workerTaskDef, batchTaskDef].forEach(taskDef => {
      NagSuppressions.addResourceSuppressions(taskDef, [
        {
          id: 'AwsSolutions-ECS2',
          reason:
            'Sensitive values (DB credentials, API keys) are injected via Secrets Manager (secrets: section). ' +
            'Environment variables contain only non-sensitive config (queue URLs, bucket names, profiles). ' +
            'Per D-5 (適正水準の原則): moving all config to SSM Parameter Store increases ' +
            'operational complexity beyond what 0.5 person-month/month can maintain.',
        },
      ]);
    });

    // ════════════════════════════════════════════════════
    // EventBridge Scheduler(KSM-ADR-008: 抽選・期限系バッチ)
    // ════════════════════════════════════════════════════

    // EventBridge Scheduler 用 IAM ロール
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      roleName: `yoyaku-${env}-role-scheduler`,
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    schedulerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecs:RunTask'],
      resources: [batchTaskDef.taskDefinitionArn],
    }));
    schedulerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [taskRole.roleArn, executionRole.roleArn],
    }));
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(schedulerRole).add(k, v));

    const batchSubnetIds = vpc
      .selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS })
      .subnetIds;

    // 共通ターゲット設定(RunTask)
    const runTaskTarget = {
      arn: this.cluster.clusterArn,
      roleArn: schedulerRole.roleArn,
      input: JSON.stringify({
        containerOverrides: [
          {
            name: `yoyaku-${env}-batch`,
            command: ['--job=JB-PLACEHOLDER'],
          },
        ],
      }),
      ecsParameters: {
        taskDefinitionArn: batchTaskDef.taskDefinitionArn,
        taskCount: 1,
        launchType: 'FARGATE',
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: batchSubnetIds,
            securityGroups: [appSg.securityGroupId],
            assignPublicIp: 'DISABLED',
          },
        },
      },
    };

    // JB-01 抽選実行: 毎月8日 6:00(KSM-ADR-008・QA No.14)
    // NOTE: ApplicationRunner+batch_job_locks で冪等性担保(KSM-ADR-012 参照)
    new scheduler.CfnSchedule(this, 'LotterySchedule', {
      name: `yoyaku-${env}-schedule-lottery`,
      description: 'JB-01: 抽選実行(毎月8日 6:00 JST = 21:00 UTC前日)',
      scheduleExpression: 'cron(0 21 7 * ? *)', // JST 8日 6:00 = UTC 7日 21:00
      scheduleExpressionTimezone: 'Asia/Tokyo',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        ...runTaskTarget,
        input: JSON.stringify({
          containerOverrides: [{
            name: `yoyaku-${env}-batch`,
            command: ['--job=JB-01'],
          }],
        }),
        arn: this.cluster.clusterArn,
        roleArn: schedulerRole.roleArn,
        ecsParameters: runTaskTarget.ecsParameters,
      },
    });

    // JB-02 仮押さえ自動解放: 15分間隔(KSM-ADR-008)
    new scheduler.CfnSchedule(this, 'HoldReleaseSchedule', {
      name: `yoyaku-${env}-schedule-hold-release`,
      description: 'JB-02: 仮押さえ自動解放(15分間隔)',
      scheduleExpression: 'rate(15 minutes)',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: this.cluster.clusterArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({
          containerOverrides: [{
            name: `yoyaku-${env}-batch`,
            command: ['--job=JB-02'],
          }],
        }),
        ecsParameters: runTaskTarget.ecsParameters,
      },
    });

    // JB-03 支払期限超過取消: 毎時
    new scheduler.CfnSchedule(this, 'PaymentExpireSchedule', {
      name: `yoyaku-${env}-schedule-payment-expire`,
      description: 'JB-03: 支払期限超過取消(毎時)',
      scheduleExpression: 'rate(1 hour)',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: this.cluster.clusterArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({
          containerOverrides: [{
            name: `yoyaku-${env}-batch`,
            command: ['--job=JB-03'],
          }],
        }),
        ecsParameters: runTaskTarget.ecsParameters,
      },
    });

    // JB-04 日次集計: 毎日 1:00 JST
    new scheduler.CfnSchedule(this, 'DailyStatsSchedule', {
      name: `yoyaku-${env}-schedule-daily-stats`,
      description: 'JB-04: 日次集計(毎日1:00 JST)',
      scheduleExpression: 'cron(0 16 * * ? *)', // JST 1:00 = UTC 16:00前日
      scheduleExpressionTimezone: 'Asia/Tokyo',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: this.cluster.clusterArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({
          containerOverrides: [{
            name: `yoyaku-${env}-batch`,
            command: ['--job=JB-04'],
          }],
        }),
        ecsParameters: runTaskTarget.ecsParameters,
      },
    });

    // ── アウトプット ────────────────────────────────────
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      exportName: `yoyaku-${env}-alb-dns`,
    });
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      exportName: `yoyaku-${env}-cluster-name`,
    });
    new cdk.CfnOutput(this, 'NotificationQueueUrl', {
      value: this.notificationQueue.queueUrl,
      exportName: `yoyaku-${env}-queue-notification-url`,
    });
    new cdk.CfnOutput(this, 'NotificationDlqUrl', {
      value: this.notificationDlq.queueUrl,
      exportName: `yoyaku-${env}-queue-notification-dlq-url`,
    });
    new cdk.CfnOutput(this, 'RepositoryUri', {
      value: this.repository.repositoryUri,
      exportName: `yoyaku-${env}-ecr-app-uri`,
    });

    // TargetGroup を使用して ts の unused 警告を回避
    void targetGroup;
  }
}
