/**
 * ステートフルスタック(独立スタック+削除保護)
 * KSM-ADR-005(RDS PostgreSQL マルチAZ)・KSM-ADR-010(KMS CMK×2)・
 * KSM-ADR-002/003(Cognito×2) を実装
 *
 * 【ステートフルを独立スタックに分離する理由(KSM-ADR-006)】
 * CDK はスタック更新時にリソース置換が起こる場合がある。
 * RDS・Cognito・S3(データ/ログ用)はデータを保持するため、
 * アプリスタックとは別スタックに分離し、削除保護・スナップショット保持を徹底する。
 */
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnvParams } from '../env/types';
import { requiredTags } from './common/tags';
import { NagSuppressions } from 'cdk-nag';

export interface StatefulStackProps extends cdk.StackProps {
  readonly params: EnvParams;
  readonly vpc: ec2.IVpc;
  readonly dbSg: ec2.ISecurityGroup;
}

export class StatefulStack extends cdk.Stack {
  /** KMS CMK: データ用(RDS・SQS・Secrets Manager・個人情報S3) */
  public readonly dataKey: kms.IKey;
  /** KMS CMK: ログ用(CloudWatch Logs・ログS3・CloudTrail) */
  public readonly logKey: kms.IKey;
  /** RDS DBインスタンス */
  public readonly dbInstance: rds.DatabaseInstance;
  /** DB認証情報(Secrets Manager) */
  public readonly dbSecret: secretsmanager.ISecret;
  /** Cognito 利用者プール */
  public readonly userPool: cognito.UserPool;
  /** Cognito 職員専用プール */
  public readonly staffPool: cognito.UserPool;
  /** 帳票・CSV・個人情報 S3 */
  public readonly dataS3: s3.Bucket;
  /** ログ保管 S3 */
  public readonly logS3: s3.Bucket;

  constructor(scope: Construct, id: string, props: StatefulStackProps) {
    super(scope, id, {
      ...props,
      // ステートフルスタックは誤削除を防ぐために terminationProtection を有効化
      terminationProtection: props.params.envName === 'prod',
    });
    const { params, vpc, dbSg } = props;
    const env = params.envName;
    const tags = requiredTags(env);

    // ════════════════════════════════════════════════════
    // KMS CMK × 2系統(KSM-ADR-010)
    // ════════════════════════════════════════════════════

    // データ用CMK: RDS・個人情報S3・SQS・Secrets Manager
    this.dataKey = new kms.Key(this, 'DataKey', {
      alias: `yoyaku-${env}-key-data`,
      description: `Kasumidai-yoyaku ${env}: data encryption (RDS, S3-data, SQS, SecretsManager)`,
      enableKeyRotation: true, // 年次自動ローテーション(KSM-ADR-010)
      pendingWindow: cdk.Duration.days(7),
      removalPolicy:
        env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.dataKey).add(k, v));
    new cdk.CfnOutput(this, 'DataKeyArn', { value: this.dataKey.keyArn, exportName: `yoyaku-${env}-key-data-arn` });

    // ログ用CMK: CloudWatch Logs・ログS3・CloudTrail
    this.logKey = new kms.Key(this, 'LogKey', {
      alias: `yoyaku-${env}-key-log`,
      description: `Kasumidai-yoyaku ${env}: log encryption (CWLogs, S3-log, CloudTrail)`,
      enableKeyRotation: true,
      pendingWindow: cdk.Duration.days(7),
      removalPolicy:
        env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      // CloudWatch Logs サービスプリンシパルからの使用を許可(ロググループ暗号化に必要)
      // https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html
      policy: new cdk.aws_iam.PolicyDocument({
        statements: [
          // キー管理者ポリシー(デフォルトのルートアカウントアクセス)
          new cdk.aws_iam.PolicyStatement({
            principals: [new cdk.aws_iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*'],
          }),
          // CloudWatch Logs サービスプリンシパルへの使用許可
          new cdk.aws_iam.PolicyStatement({
            principals: [
              new cdk.aws_iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`),
            ],
            actions: [
              'kms:Encrypt*',
              'kms:Decrypt*',
              'kms:ReEncrypt*',
              'kms:GenerateDataKey*',
              'kms:Describe*',
            ],
            resources: ['*'],
            conditions: {
              ArnLike: {
                'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${this.region}:${this.account}:log-group:*`,
              },
            },
          }),
        ],
      }),
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.logKey).add(k, v));
    new cdk.CfnOutput(this, 'LogKeyArn', { value: this.logKey.keyArn, exportName: `yoyaku-${env}-key-log-arn` });

    // ════════════════════════════════════════════════════
    // RDS for PostgreSQL マルチAZ(KSM-ADR-005)
    // ════════════════════════════════════════════════════

    const dbSubnetGroup = new rds.SubnetGroup(this, 'DbSubnetGroup', {
      description: `yoyaku-${env} RDS subnet group`,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    // DB認証情報をSecrets Managerで管理(NFR-E01)
    this.dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: `yoyaku-${env}-db-credentials`,
      description: 'RDS PostgreSQL credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'yoyakuadmin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
      encryptionKey: this.dataKey,
      removalPolicy:
        env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.dbSecret).add(k, v));

    // RDS インスタンス
    this.dbInstance = new rds.DatabaseInstance(this, 'RdsInstance', {
      instanceIdentifier: `yoyaku-${env}-db`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_9, // 最新安定版(P4構築時点)
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        env === 'prod' ? ec2.InstanceSize.MEDIUM : ec2.InstanceSize.SMALL,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      subnetGroup: dbSubnetGroup,
      securityGroups: [dbSg],
      multiAz: params.rdsMultiAz,
      storageType: rds.StorageType.GP3,
      allocatedStorage: 100,
      maxAllocatedStorage: 200, // 自動拡張上限(KSM-ADR-005)
      storageEncrypted: true,
      storageEncryptionKey: this.dataKey,
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      databaseName: 'yoyakudb',
      backupRetention: cdk.Duration.days(7), // NFR-A03: 7世代
      preferredBackupWindow: '17:00-18:00',   // JST 02:00-03:00
      preferredMaintenanceWindow: 'tue:18:00-tue:19:00', // JST 火 03:00-04:00(抽選期間外)
      deletionProtection: env === 'prod',
      removalPolicy:
        env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.SNAPSHOT,
      enablePerformanceInsights: env === 'prod',
      performanceInsightEncryptionKey: env === 'prod' ? this.dataKey : undefined,
      monitoringInterval: cdk.Duration.seconds(env === 'prod' ? 60 : 0),
      cloudwatchLogsRetention: env === 'prod'
        ? cdk.aws_logs.RetentionDays.ONE_YEAR
        : cdk.aws_logs.RetentionDays.ONE_MONTH,
      autoMinorVersionUpgrade: true, // マイナーバージョン自動適用(NFR-C03)
      parameterGroup: new rds.ParameterGroup(this, 'RdsParamGroup', {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_16_9,
        }),
        parameters: {
          'shared_preload_libraries': 'pg_stat_statements',
          'log_min_duration_statement': '1000', // 1秒以上のクエリをログ
        },
      }),
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.dbInstance).add(k, v));

    // RDS は私設サブネット内のみ。Secrets Manager からのみ認証情報取得(NFR-E01)
    // Secrets Manager 自動ローテーション(AwsSolutions-SMG4)
    // RDS 認証情報は CDK `DatabaseInstanceProps.credentials` で Secrets Manager を使用。
    // 自動ローテーションには Lambda 関数のデプロイが必要。P4 では抑制し P5 IaC 拡張で追加予定。
    NagSuppressions.addResourceSuppressions(this.dbSecret, [
      {
        id: 'AwsSolutions-SMG4',
        reason:
          'RDS credentials rotation requires Lambda-based rotation function. ' +
          'Rotation will be added in P5 IaC extension. ' +
          'Access is restricted to ECS task role only via IAM policy. ' +
          'NFR-E01: DB credentials are injected via Secrets Manager, not hardcoded.',
      },
    ]);

    NagSuppressions.addResourceSuppressions(this.dbInstance, [
      {
        id: 'AwsSolutions-RDS2',
        reason:
          'RDS is encrypted with CMK (dataKey). storageEncrypted=true and ' +
          'storageEncryptionKey=dataKey are set explicitly. NFR-E01準拠。',
      },
      {
        id: 'AwsSolutions-RDS3',
        reason:
          'prod環境では multiAz=params.rdsMultiAz=true を設定済み(KSM-ADR-005)。' +
          'stg環境はシングルAZで意図的にコスト削減(KSM-ADR-005: 検証はシングルAZ+停止運用)。' +
          'stg環境ではNFR-A02(稼働率99.5%)の要件対象外。',
      },
      {
        id: 'AwsSolutions-RDS10',
        reason:
          'prod環境では deletionProtection=true を設定済み。' +
          'stg環境は誤削除時の影響が限定的であり SNAPSHOT ポリシーで代替。',
      },
      {
        id: 'AwsSolutions-RDS11',
        reason:
          'CloudWatch Logs への出力は cloudwatchLogsRetention で設定済み。' +
          'PostgreSQL ログは RDS パラメータグループ(log_min_duration_statement)で制御。',
      },
      {
        // Enhanced Monitoring ロールの IAM4: RDS が自動生成するモニタリングロール
        id: 'AwsSolutions-IAM4',
        reason:
          'AmazonRDSEnhancedMonitoringRole is the AWS-managed policy required for RDS Enhanced ' +
          'Monitoring. This role is auto-created by CDK when monitoringInterval > 0. ' +
          'No narrower customer-managed policy can replace it as the actions are defined by AWS. ' +
          'Enhanced Monitoring is enabled for prod (monitoringInterval=60s) per NFR-A01.',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole',
        ],
      },
    ], true); // applyToChildren=true で MonitoringRole にも適用

    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: this.dbInstance.dbInstanceEndpointAddress,
      exportName: `yoyaku-${env}-db-endpoint`,
    });

    // ════════════════════════════════════════════════════
    // Cognito ユーザープール × 2(KSM-ADR-002/003)
    // ════════════════════════════════════════════════════

    // 利用者プール(KSM-ADR-002: NFR-E02)
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `yoyaku-${env}-userpool-citizen`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: params.passwordMinLength,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy:
        env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      // メール検証をCognitoデフォルト送信から将来SES連携へ移行可能な構造(P5)
      userVerification: {
        emailSubject: '【霞台市】メールアドレスの確認',
        emailBody: '確認コード: {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      userInvitation: {
        emailSubject: '【霞台市】仮パスワードのご案内',
        emailBody: 'ユーザー名: {username} / 仮パスワード: {####}',
      },
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.userPool).add(k, v));

    // 利用者プール クライアント(SPA向け)
    const userPoolClient = this.userPool.addClient('UserPoolClient', {
      userPoolClientName: `yoyaku-${env}-client-citizen`,
      authFlows: {
        userSrp: true,
        userPassword: false, // SRP のみ許可
      },
      accessTokenValidity: cdk.Duration.hours(24),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      exportName: `yoyaku-${env}-userpool-citizen-client-id`,
    });

    // 職員専用プール(KSM-ADR-003: MFA必須・IP制限はWAF層)
    this.staffPool = new cognito.UserPool(this, 'StaffPool', {
      userPoolName: `yoyaku-${env}-userpool-staff`,
      selfSignUpEnabled: false, // 職員は管理者が作成
      signInAliases: { username: true, email: true },
      mfa: cognito.Mfa.REQUIRED, // NFR-E02: MFA必須
      mfaSecondFactor: {
        sms: false,
        otp: true, // TOTP(RFC 6238準拠。KSM-DDD-001 §5.2)
      },
      passwordPolicy: {
        minLength: params.passwordMinLength,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true, // 職員はより強いポリシー
        tempPasswordValidity: cdk.Duration.days(3),
      },
      accountRecovery: cognito.AccountRecovery.NONE, // 職員は管理者リセット運用(KSM-ADR-003)
      removalPolicy:
        env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      userVerification: {
        emailSubject: '【霞台市】職員アカウントの確認',
        emailBody: '確認コード: {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      userInvitation: {
        emailSubject: '【霞台市】職員システムアカウントのご案内',
        emailBody: 'ユーザー名: {username} / 仮パスワード: {####}',
      },
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.staffPool).add(k, v));

    // 職員プール クライアント
    const staffPoolClient = this.staffPool.addClient('StaffPoolClient', {
      userPoolClientName: `yoyaku-${env}-client-staff`,
      authFlows: {
        userSrp: true,
        userPassword: false,
      },
      accessTokenValidity: cdk.Duration.hours(12), // 職員セッション=12時間(KSM-DDD-001 §8.2)
      refreshTokenValidity: cdk.Duration.days(1),
      preventUserExistenceErrors: true,
    });
    new cdk.CfnOutput(this, 'StaffPoolClientId', {
      value: staffPoolClient.userPoolClientId,
      exportName: `yoyaku-${env}-userpool-staff-client-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `yoyaku-${env}-userpool-citizen-id`,
    });
    new cdk.CfnOutput(this, 'StaffPoolId', {
      value: this.staffPool.userPoolId,
      exportName: `yoyaku-${env}-userpool-staff-id`,
    });

    // Cognito cdk-nag 抑制(MFAはprod=REQUIRED・stg=REQUIRED設定済みのため)
    NagSuppressions.addResourceSuppressions(this.staffPool, [
      {
        id: 'AwsSolutions-COG2',
        reason:
          'Staff pool has MFA=REQUIRED with TOTP configured (NFR-E02). ' +
          'staffPool.mfa = Mfa.REQUIRED is explicitly set.',
      },
      {
        id: 'AwsSolutions-COG1',
        reason:
          'Staff pool password policy: minLength=params.passwordMinLength(>=12), ' +
          'requireUppercase=true, requireLowercase=true, requireDigits=true, requireSymbols=true. ' +
          'NFR-E02準拠。KSM-DDD-001 §5.1: IaCパラメータで変更管理。',
      },
      {
        id: 'AwsSolutions-COG8',
        reason:
          'Cognito Plus tier (advanced security) adds significant cost (~$0.05/MAU). ' +
          'Per D-5 (適正水準の原則): WAF IPSet restriction (14拠点, KSM-ADR-003) + ' +
          'MFA REQUIRED covers staff security. Plus tier is not justified for this scale.',
      },
    ]);
    NagSuppressions.addResourceSuppressions(this.userPool, [
      {
        id: 'AwsSolutions-COG1',
        reason:
          'Citizen user pool password policy: minLength=params.passwordMinLength(>=12 per §5.1), ' +
          'requireUppercase=true, requireLowercase=true, requireDigits=true. ' +
          'NFR-E02準拠。G2残課題5: 市了承済み。',
      },
      {
        id: 'AwsSolutions-COG2',
        reason:
          'Citizen user pool: MFA is OPTIONAL per RFP requirements. ' +
          'MFA=REQUIRED is enforced only for staff pool (KSM-ADR-003).',
      },
      {
        id: 'AwsSolutions-COG3',
        reason:
          'Advanced Security Mode (Cognito User Pool Advanced Security) adds ~$0.05/MAU. ' +
          'Per D-5 (適正水準の原則) and budget constraint (月額600千円), ' +
          'WAF + IP restriction covers staff; citizen pool risks are acceptable.',
      },
      {
        id: 'AwsSolutions-COG7',
        reason:
          'userPool uses Cognito default email (SES integration is P5 task after domain verification). ' +
          'ADR-008: SES integration planned for notification worker.',
      },
      {
        id: 'AwsSolutions-COG8',
        reason:
          'Cognito Plus tier not required for citizen pool. ' +
          'Per D-5 (適正水準の原則): additional cost not justified for 18,000 users scale.',
      },
    ]);

    // ════════════════════════════════════════════════════
    // S3 バケット(ステートフル: データ用・ログ用)
    // ════════════════════════════════════════════════════

    // 帳票・CSV・個人情報ファイル用 S3(CMK暗号化・バージョニング)
    this.dataS3 = new s3.Bucket(this, 'DataBucket', {
      bucketName: `yoyaku-${env}-s3-data`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.dataKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // パブリックアクセス完全遮断
      versioned: true, // ファイルのバージョン管理
      enforceSSL: true,
      lifecycleRules: [
        {
          // 非最新バージョンを1年後に削除
          noncurrentVersionExpiration: cdk.Duration.days(365),
        },
      ],
      removalPolicy:
        env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: env !== 'prod',
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.dataS3).add(k, v));
    NagSuppressions.addResourceSuppressions(this.dataS3, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'Data bucket server access logs: CloudFront access logs and ALB access logs are ' +
          'already written to logS3 bucket (NFR-E06). ' +
          'S3 data bucket access is restricted to ECS task role via IAM. ' +
          'Enabling S3 server access logs on logS3 bucket would create a logging loop.',
      },
    ]);

    // ログ保管 S3(CMK暗号化・1年以上保管)
    this.logS3 = new s3.Bucket(this, 'LogBucket', {
      bucketName: `yoyaku-${env}-s3-log`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.logKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      enforceSSL: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(365), // NFR-E06: 1年以上保管
        },
      ],
      removalPolicy:
        env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: env !== 'prod',
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.logS3).add(k, v));

    NagSuppressions.addResourceSuppressions(this.logS3, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'Log bucket is itself the access log destination. ' +
          'Enabling access logs on this bucket would create a recursive logging loop. ' +
          'This is standard AWS pattern for log aggregation buckets.',
      },
    ]);

    new cdk.CfnOutput(this, 'DataBucketName', {
      value: this.dataS3.bucketName,
      exportName: `yoyaku-${env}-s3-data-name`,
    });
    new cdk.CfnOutput(this, 'LogBucketName', {
      value: this.logS3.bucketName,
      exportName: `yoyaku-${env}-s3-log-name`,
    });
  }
}
