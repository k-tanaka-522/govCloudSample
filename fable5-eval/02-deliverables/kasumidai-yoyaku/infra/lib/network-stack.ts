/**
 * ネットワークスタック: VPC・サブネット・セキュリティグループ
 * KSM-BDD-001 §3.2・§4・§6 準拠
 * steering/iac規約: SG は 0.0.0.0/0 を 443/80 のみ、SSH/RDP全開放禁止
 */
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvParams } from '../env/types';
import { requiredTags } from './common/tags';
import { NagSuppressions } from 'cdk-nag';

export interface NetworkStackProps extends cdk.StackProps {
  readonly params: EnvParams;
}

export class NetworkStack extends cdk.Stack {
  /** VPC本体 */
  public readonly vpc: ec2.Vpc;
  /** ALB用SG(CloudFront→ALB 443のみ) */
  public readonly albSg: ec2.SecurityGroup;
  /** ECS API/Workerタスク用SG */
  public readonly appSg: ec2.SecurityGroup;
  /** RDS用SG(appSg→5432のみ) */
  public readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    const { params } = props;
    const env = params.envName;
    const tags = requiredTags(env);

    // ── VPC ──────────────────────────────────────────────
    // 2AZ・public(ALB/NAT)・private app(ECS)・private db(RDS)
    // S3 Gatewayエンドポイント(無料)で S3 アクセスを VPC 内に限定
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `yoyaku-${env}-vpc`,
      cidr: '10.0.0.0/16',
      maxAzs: 2,
      natGateways: params.envName === 'prod' ? 2 : 1, // prod: AZ冗長(KSM-BDD-001 §5.1)
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private-app',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'private-db',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
      },
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.vpc).add(k, v));

    // ── ALB セキュリティグループ ─────────────────────────
    // prod: CloudFrontマネージドプレフィックスリスト経由のみ許可
    // stg: 0.0.0.0/0 からの 443/80 を許可
    //   (理由: CloudFrontプレフィックスリストは45エントリ×2ルール=90重みで
    //    アカウントのSGルール上限60を超過するため。stg環境は開発・検証用途のみ)
    //   (KSM-ENV-001 §4: stgはコスト・制約の範囲で許容される簡略化を記録)
    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      securityGroupName: `yoyaku-${env}-sg-alb`,
      description: env === 'prod'
        ? 'ALB: allow HTTPS from CloudFront prefix list (prod)'
        : 'ALB: allow HTTP/HTTPS from internet for stg (CloudFront PL quota workaround)',
      allowAllOutbound: false,
    });

    if (env === 'prod') {
      // prod: CloudFrontマネージドプレフィックスリスト経由のみ許可
      this.albSg.addIngressRule(
        ec2.Peer.prefixList(params.cloudFrontPrefixListId),
        ec2.Port.tcp(443),
        'CloudFront HTTPS inbound (prod)',
      );
      this.albSg.addIngressRule(
        ec2.Peer.prefixList(params.cloudFrontPrefixListId),
        ec2.Port.tcp(80),
        'CloudFront HTTP inbound (prod)',
      );
    } else {
      // stg: 0.0.0.0/0 から 443/80 を許可(プレフィックスリスト上限回避)
      // steering/iac規約3: 0.0.0.0/0 インバウンドは 443/80 のみ → 準拠
      this.albSg.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(443),
        'HTTPS from internet (stg: CloudFront PL quota workaround)',
      );
      this.albSg.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(80),
        'HTTP from internet (stg: CloudFront PL quota workaround)',
      );
    }

    // ALBからECSへのアウトバウンド
    this.albSg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'to ECS app port',
    );
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.albSg).add(k, v));

    NagSuppressions.addResourceSuppressions(this.albSg, [
      {
        id: 'AwsSolutions-EC23',
        reason:
          'prod: ALB SG uses CloudFront managed prefix list (not 0.0.0.0/0). ' +
          'stg: 0.0.0.0/0 for 443/80 only — CloudFront managed prefix list has 45 entries ' +
          'which exceeds account SGRule quota (60) when used twice (443+80). ' +
          'steering/iac規約3準拠: SSH/RDP 全開放なし。443/80 のみ許可。' +
          'stg環境でのALB直接アクセスはCloudFront WAFをバイパスするが、stgは開発用途のみ。' +
          'KSM-ENV-001 §4に記録。',
      },
    ]);

    // ── ECS アプリ セキュリティグループ ─────────────────
    this.appSg = new ec2.SecurityGroup(this, 'AppSg', {
      vpc: this.vpc,
      securityGroupName: `yoyaku-${env}-sg-app`,
      description: 'ECS app/worker/batch: allow 8080 from ALB',
      allowAllOutbound: true, // NAT GW 経由でアウトバウンド(SES・決済代行API等)
    });
    this.appSg.addIngressRule(
      this.albSg,
      ec2.Port.tcp(8080),
      'from ALB only',
    );
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.appSg).add(k, v));

    // ── RDS セキュリティグループ ─────────────────────────
    this.dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: this.vpc,
      securityGroupName: `yoyaku-${env}-sg-db`,
      description: 'RDS PostgreSQL: allow 5432 from ECS app SG only',
      allowAllOutbound: false,
    });
    this.dbSg.addIngressRule(
      this.appSg,
      ec2.Port.tcp(5432),
      'PostgreSQL from ECS app only',
    );
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.dbSg).add(k, v));

    // VPC Flow Logs(AwsSolutions-VPC7: ネットワーク監査ログ)
    const flowLogGroup = new cdk.aws_logs.LogGroup(this, 'VpcFlowLogGroup', {
      logGroupName: `/yoyaku/${env}/vpc/flowlogs`,
      encryptionKey: undefined, // Flow Logs はキー不要(CloudWatch 側で管理)
      retention: env === 'prod'
        ? cdk.aws_logs.RetentionDays.ONE_YEAR
        : cdk.aws_logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.vpc.addFlowLog('VpcFlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
    });

    // ── アウトプット ─────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `yoyaku-${env}-vpc-id`,
    });
    new cdk.CfnOutput(this, 'AppSgId', {
      value: this.appSg.securityGroupId,
      exportName: `yoyaku-${env}-sg-app-id`,
    });
    new cdk.CfnOutput(this, 'DbSgId', {
      value: this.dbSg.securityGroupId,
      exportName: `yoyaku-${env}-sg-db-id`,
    });
  }
}
