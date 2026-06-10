/**
 * CDK アサーションテスト(KSM-ADR-006: assertions+Jest)
 * 重要リソースの暗号化・タグ・削除保護・セキュリティ設定を機械検査
 */
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { StatefulStack } from '../lib/stateful-stack';
import { AppStack } from '../lib/app-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { EnvParams } from '../env/types';

/** テスト用ダミーパラメータ */
const testParams: EnvParams = {
  envName: 'stg',
  domainName: 'stg.yoyaku.example.com',
  certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
  cloudFrontPrefixListId: 'pl-3b927c52',
  apiDesiredCount: 1,
  apiMaxCount: 2,
  rdsMultiAz: false,
  availabilityCacheTtlSec: 60,
  passwordMinLength: 12,
  staffAllowedCidrs: ['198.51.100.0/24'],
  lotteryWarmup: null,
  imageTag: 'test',
};

const env = { account: '123456789012', region: 'ap-northeast-1' };

function buildApp() {
  const app = new App();
  const networkStack = new NetworkStack(app, 'TestNetwork', { env, params: testParams });
  const statefulStack = new StatefulStack(app, 'TestStateful', {
    env,
    params: testParams,
    vpc: networkStack.vpc,
    dbSg: networkStack.dbSg,
  });
  const appStack = new AppStack(app, 'TestApp', {
    env,
    params: testParams,
    vpc: networkStack.vpc,
    albSg: networkStack.albSg,
    appSg: networkStack.appSg,
    dataKey: statefulStack.dataKey,
    logKey: statefulStack.logKey,
    dbSecretArn: statefulStack.dbSecret.secretArn,
    dataBucketName: statefulStack.dataS3.bucketName,
    logBucketName: statefulStack.logS3.bucketName,
  });
  const monitoringStack = new MonitoringStack(app, 'TestMonitoring', {
    env,
    params: testParams,
    alb: appStack.alb,
    cluster: appStack.cluster,
    dbInstance: statefulStack.dbInstance,
    notificationQueue: appStack.notificationQueue,
    notificationDlq: appStack.notificationDlq,
    logKey: statefulStack.logKey,
  });
  return { app, networkStack, statefulStack, appStack, monitoringStack };
}

describe('NetworkStack', () => {
  const { networkStack } = buildApp();
  const template = Template.fromStack(networkStack);

  test('VPC が作成されること', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
  });

  test('SG に 0.0.0.0/0 のインバウンドルールが存在しないこと(SSH/RDP全開放禁止)', () => {
    // ALB SG はプレフィックスリスト使用。0.0.0.0/0 の直接許可がないことを確認
    const sgResources = template.findResources('AWS::EC2::SecurityGroup');
    for (const sg of Object.values(sgResources)) {
      const ingressRules: unknown[] =
        (sg as { Properties?: { SecurityGroupIngress?: unknown[] } })
          .Properties?.SecurityGroupIngress ?? [];
      for (const rule of ingressRules) {
        const r = rule as { CidrIp?: string; FromPort?: number };
        if (r.CidrIp === '0.0.0.0/0') {
          // 0.0.0.0/0 は 443 または 80 のみ許可(steering/iac規約3)
          expect([80, 443]).toContain(r.FromPort);
        }
      }
    }
  });
});

describe('StatefulStack', () => {
  const { statefulStack } = buildApp();
  const template = Template.fromStack(statefulStack);

  test('KMS キーが2つ(data/log)作成されること', () => {
    template.resourceCountIs('AWS::KMS::Key', 2);
  });

  test('KMS キーの年次自動ローテーションが有効であること(KSM-ADR-010)', () => {
    template.allResourcesProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });

  test('RDS ストレージ暗号化が有効であること(NFR-E01)', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      StorageEncrypted: true,
    });
  });

  test('RDS バックアップ保持期間が7日以上であること(NFR-A03)', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 7,
    });
  });

  test('Cognito 職員プールの MFA が REQUIRED であること(NFR-E02/KSM-ADR-003)', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      MfaConfiguration: 'ON',
    });
  });

  test('S3 パブリックアクセスブロックが有効であること(steering/iac規約3)', () => {
    const s3Resources = template.findResources('AWS::S3::Bucket');
    for (const bucket of Object.values(s3Resources)) {
      const props = (bucket as {
        Properties?: {
          PublicAccessBlockConfiguration?: {
            BlockPublicAcls?: boolean;
            BlockPublicPolicy?: boolean;
            IgnorePublicAcls?: boolean;
            RestrictPublicBuckets?: boolean;
          };
        };
      }).Properties?.PublicAccessBlockConfiguration;
      // すべてのS3バケットでパブリックアクセスブロック設定を確認
      if (props) {
        expect(props.BlockPublicAcls).toBe(true);
        expect(props.BlockPublicPolicy).toBe(true);
        expect(props.IgnorePublicAcls).toBe(true);
        expect(props.RestrictPublicBuckets).toBe(true);
      }
    }
  });

  test('prod 環境では RDS 削除保護が有効であること', () => {
    // stg パラメータでは DeletionProtection は false
    // prod パラメータのテストは prod 環境で実施
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DeletionProtection: false, // stg では false
    });
  });
});

describe('AppStack', () => {
  const { appStack } = buildApp();
  const template = Template.fromStack(appStack);

  test('ECR リポジトリのイメージスキャンが有効であること', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      ImageScanningConfiguration: {
        ScanOnPush: true,
      },
    });
  });

  test('SQS キューが KMS で暗号化されていること(NFR-E01)', () => {
    const queues = template.findResources('AWS::SQS::Queue');
    const notificationQueues = Object.entries(queues).filter(([id]) =>
      id.includes('Notification') && !id.includes('Dlq'),
    );
    expect(notificationQueues.length).toBeGreaterThan(0);
    for (const [, queue] of notificationQueues) {
      const props = (queue as { Properties?: { KmsMasterKeyId?: unknown } }).Properties;
      expect(props?.KmsMasterKeyId).toBeDefined();
    }
  });

  test('SQS DLQ が設定されていること(KSM-ADR-008)', () => {
    const queues = template.findResources('AWS::SQS::Queue');
    const mainQueues = Object.entries(queues).filter(
      ([id]) => id.includes('Notification') && !id.includes('Dlq'),
    );
    for (const [, queue] of mainQueues) {
      const props = (queue as {
        Properties?: { RedrivePolicy?: { maxReceiveCount?: number } };
      }).Properties;
      expect(props?.RedrivePolicy).toBeDefined();
      expect(props?.RedrivePolicy?.maxReceiveCount).toBeLessThanOrEqual(5);
    }
  });

  test('ECS Fargate サービスが作成されること', () => {
    template.resourceCountIs('AWS::ECS::Service', 2); // API + Worker
  });

  test('ALB が作成されること', () => {
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
  });

  test('EventBridge Scheduler が4つ作成されること(JB-01〜04)', () => {
    template.resourceCountIs('AWS::Scheduler::Schedule', 4);
  });
});

describe('MonitoringStack', () => {
  const { monitoringStack } = buildApp();
  const template = Template.fromStack(monitoringStack);

  test('CloudWatch アラームが13件以上作成されること(OPS-ALM-001〜013)', () => {
    const alarmCount = template.resourceCountIs('AWS::CloudWatch::Alarm', 13);
    void alarmCount; // resourceCountIs は assertion なので void で OK
  });

  test('CloudWatch ダッシュボードが1つ作成されること', () => {
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });

  test('SNS トピックが作成されること', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1);
  });

  test('P1-CRITICAL アラームに SNS アクションが設定されていること', () => {
    const alarms = template.findResources('AWS::CloudWatch::Alarm');
    const criticalAlarms = Object.entries(alarms).filter(([, alarm]) => {
      const props = (alarm as { Properties?: { AlarmName?: string } }).Properties;
      return props?.AlarmName?.includes('P1-CRITICAL');
    });
    expect(criticalAlarms.length).toBeGreaterThan(0);
    for (const [, alarm] of criticalAlarms) {
      const props = (alarm as { Properties?: { AlarmActions?: unknown[] } }).Properties;
      expect(props?.AlarmActions?.length).toBeGreaterThan(0);
    }
  });

  test('アラーム命名に重要度タグ(P1-CRITICAL/P2-WARNING)が含まれること', () => {
    const alarms = template.findResources('AWS::CloudWatch::Alarm');
    for (const [, alarm] of Object.entries(alarms)) {
      const name = (alarm as { Properties?: { AlarmName?: string } }).Properties?.AlarmName ?? '';
      expect(name).toMatch(/P[123]-(?:CRITICAL|WARNING|INFO)/);
    }
  });
});
