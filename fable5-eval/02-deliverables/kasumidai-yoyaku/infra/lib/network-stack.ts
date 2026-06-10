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
    // CloudFront→ALB は HTTPS(443)のみ許可(CloudFrontマネージドプレフィックスリスト使用)
    // steering/iac規約: 0.0.0.0/0 インバウンドは 443/80 のみ
    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      securityGroupName: `yoyaku-${env}-sg-alb`,
      description: 'ALB: allow HTTPS from CloudFront prefix list',
      allowAllOutbound: false,
    });
    // CloudFrontマネージドプレフィックスリスト経由の HTTPS のみ許可
    this.albSg.addIngressRule(
      ec2.Peer.prefixList(params.cloudFrontPrefixListId),
      ec2.Port.tcp(443),
      'CloudFront HTTPS inbound',
    );
    // HTTP は CloudFront 側で HTTPS リダイレクト済みのため ALB では不要だが
    // CloudFront→ALB がHTTPの場合のみ許可(CloudFront-ALB間はHTTP可)
    this.albSg.addIngressRule(
      ec2.Peer.prefixList(params.cloudFrontPrefixListId),
      ec2.Port.tcp(80),
      'CloudFront HTTP (redirect to HTTPS handled at CloudFront)',
    );
    // ALBからECSへのアウトバウンド
    this.albSg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'to ECS app port',
    );
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.albSg).add(k, v));

    // ALB SG の 0.0.0.0/0 ルールが存在しないことは上記設計で担保されているが
    // cdk-nag AwsSolutions-EC23 を抑制(プレフィックスリスト使用のため)
    NagSuppressions.addResourceSuppressions(this.albSg, [
      {
        id: 'AwsSolutions-EC23',
        reason:
          'ALB SG uses CloudFront managed prefix list (not 0.0.0.0/0). ' +
          'Direct internet access is blocked at CloudFront layer. ' +
          'steering/iac規約3準拠: SSH/RDP 全開放なし。443/80 のみ CloudFront 経由で許可。',
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
