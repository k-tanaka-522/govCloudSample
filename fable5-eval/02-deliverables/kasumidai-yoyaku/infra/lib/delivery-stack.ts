/**
 * 配信スタック: CloudFront + S3(SPA静的アセット) + WAF
 * KSM-ADR-009(S3+CloudFront・空き照会APIキャッシュ TTL60秒)
 * KSM-ADR-003(WAF IPSet職員パス制限・14拠点)
 * NFR-E08・QA No.17の確定IPリストをパラメータ化
 */
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { EnvParams } from '../env/types';
import { requiredTags } from './common/tags';
import { NagSuppressions } from 'cdk-nag';

export interface DeliveryStackProps extends cdk.StackProps {
  readonly params: EnvParams;
  readonly alb: elbv2.IApplicationLoadBalancer;
  readonly logBucketName: string;
}

export class DeliveryStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly spaBucket: s3.Bucket;
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: DeliveryStackProps) {
    super(scope, id, {
      ...props,
      // CloudFront 用 WAF は us-east-1 に作成が必須だが
      // CDK では同一スタック内で us-east-1 を指定する場合は Cross-Stack が必要
      // ここでは us-east-1 スタックとして宣言(bin/app.ts で env: { region: 'us-east-1' } を設定)
    });
    const { params } = props;
    const env = params.envName;
    const tags = requiredTags(env);

    // ════════════════════════════════════════════════════
    // S3 バケット: SPA 静的アセット(個人情報なし → SSE-S3 で OK)
    // KSM-ADR-010: 個人情報を含まない静的アセット用途は SSE-S3(規約3の下限)
    // ════════════════════════════════════════════════════
    this.spaBucket = new s3.Bucket(this, 'SpaBucket', {
      bucketName: `yoyaku-${env}-s3-spa`,
      encryption: s3.BucketEncryption.S3_MANAGED, // 静的アセットはSSE-S3(ADR-010)
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false, // 静的アセットはCI/CDで都度差し替え
      enforceSSL: true,
      removalPolicy:
        env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: env !== 'prod',
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.spaBucket).add(k, v));

    // ════════════════════════════════════════════════════
    // WAF Web ACL(CloudFront 用。us-east-1 で作成)
    // KSM-ADR-003 §2: 職員パスへの IP 制限実装
    // NFR-E05: AWSマネージドルール+レートベースルール
    // ════════════════════════════════════════════════════

    // 職員アクセス許可 IPSet(QA No.17: 14拠点確定IP)
    const staffIpSet = new wafv2.CfnIPSet(this, 'StaffIpSet', {
      name: `yoyaku-${env}-ipset-staff`,
      description: '職員アクセス許可IP(QA No.17: 14拠点)',
      scope: 'CLOUDFRONT',
      ipAddressVersion: 'IPV4',
      addresses: params.staffAllowedCidrs,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(staffIpSet).add(k, v));

    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `yoyaku-${env}-waf-cf`,
      description: 'Kasumidai-yoyaku CloudFront WAF',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `yoyaku-${env}-waf-cf`,
        sampledRequestsEnabled: true,
      },
      rules: [
        // ルール1: AWSマネージドルール(共通ルールセット)
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 10,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
              excludedRules: [],
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `yoyaku-${env}-waf-common`,
            sampledRequestsEnabled: false,
          },
        },
        // ルール2: AWSマネージドルール(既知の不正入力)
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 20,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `yoyaku-${env}-waf-bad-inputs`,
            sampledRequestsEnabled: false,
          },
        },
        // ルール3: レートベースルール(DEV2 S-63: レート制御)
        {
          name: 'RateLimitRule',
          priority: 30,
          statement: {
            rateBasedStatement: {
              limit: 2000, // 5分間に2000リクエストまで(100req/秒×20秒許容)
              aggregateKeyType: 'IP',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `yoyaku-${env}-waf-ratelimit`,
            sampledRequestsEnabled: true,
          },
        },
        // ルール4: 職員パス IP 制限(KSM-ADR-003 §2・QA No.17)
        // /staff/* と /api/staff/* へのアクセスを 14 拠点以外からブロック
        {
          name: 'StaffPathIpRestriction',
          priority: 40,
          statement: {
            andStatement: {
              statements: [
                {
                  orStatement: {
                    statements: [
                      {
                        byteMatchStatement: {
                          fieldToMatch: { uriPath: {} },
                          positionalConstraint: 'STARTS_WITH',
                          searchString: '/staff/',
                          textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                        },
                      },
                      {
                        byteMatchStatement: {
                          fieldToMatch: { uriPath: {} },
                          positionalConstraint: 'STARTS_WITH',
                          searchString: '/api/staff/',
                          textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                        },
                      },
                    ],
                  },
                },
                {
                  notStatement: {
                    statement: {
                      ipSetReferenceStatement: {
                        arn: staffIpSet.attrArn,
                      },
                    },
                  },
                },
              ],
            },
          },
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `yoyaku-${env}-waf-staff-ip`,
            sampledRequestsEnabled: true,
          },
        },
      ],
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.webAcl).add(k, v));

    // ════════════════════════════════════════════════════
    // CloudFront ディストリビューション(KSM-ADR-009)
    // ════════════════════════════════════════════════════

    // S3 バケットポリシー(CloudFront OAC 用)
    // withOriginAccessControl() が OAC を自動作成・バケットポリシーを設定するため
    // 追加のバケットポリシーは不要だが、明示的なポリシーが必要な場合はここに追加
    this.spaBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com')],
        resources: [this.spaBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
          },
        },
      }),
    );

    // キャッシュポリシー: SPA アセット(長期キャッシュ)
    const spaAssetCachePolicy = new cloudfront.CachePolicy(this, 'SpaCachePolicy', {
      cachePolicyName: `yoyaku-${env}-cp-spa`,
      comment: 'SPA static assets: long TTL',
      defaultTtl: cdk.Duration.days(1),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // キャッシュポリシー: 空き照会 API(TTL=パラメータ値。KSM-ADR-009)
    const availabilityCachePolicy = new cloudfront.CachePolicy(this, 'AvailabilityCachePolicy', {
      cachePolicyName: `yoyaku-${env}-cp-availability`,
      comment: `空き照会API短TTLキャッシュ(${params.availabilityCacheTtlSec}秒)`,
      defaultTtl: cdk.Duration.seconds(params.availabilityCacheTtlSec),
      maxTtl: cdk.Duration.seconds(params.availabilityCacheTtlSec * 2),
      minTtl: cdk.Duration.seconds(0),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(
        'facilityId', 'yearMonth',
      ),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // オリジンリクエストポリシー: ALB 向け
    const albOriginPolicy = cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `yoyaku-${env} CloudFront distribution`,
      defaultBehavior: {
        // デフォルト: SPA 静的アセット(S3)
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.spaBucket),
        cachePolicy: spaAssetCachePolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      additionalBehaviors: {
        // /api/public/v1/availabilities* : 空き照会 API キャッシュ(KSM-ADR-009)
        '/api/public/v1/availabilities*': {
          origin: new origins.LoadBalancerV2Origin(props.alb, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            httpsPort: 443,
            customHeaders: {
              // CloudFront からのリクエストであることを ALB で検証するカスタムヘッダ
              'X-CloudFront-Secret': 'yoyaku-cf-origin-verify',
            },
          }),
          cachePolicy: availabilityCachePolicy,
          originRequestPolicy: albOriginPolicy,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        },
        // /api/* : 全 API(POST・認証付き。キャッシュなし)
        '/api/*': {
          origin: new origins.LoadBalancerV2Origin(props.alb, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            httpsPort: 443,
            customHeaders: {
              'X-CloudFront-Secret': 'yoyaku-cf-origin-verify',
            },
          }),
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: albOriginPolicy,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'ApiResponseHeaders', {
            comment: 'API: no-cache headers',
            customHeadersBehavior: {
              customHeaders: [
                {
                  header: 'Cache-Control',
                  value: 'no-store',
                  override: false,
                },
              ],
            },
          }),
        },
      },
      domainNames: [params.domainName],
      certificate: acm.Certificate.fromCertificateArn(
        this, 'Certificate', params.certificateArn,
      ),
      webAclId: this.webAcl.attrArn,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      enableLogging: true,
      logBucket: s3.Bucket.fromBucketName(this, 'LogBucketRef', props.logBucketName),
      logFilePrefix: `cloudfront/${env}/`,
      logIncludesCookies: false, // Cookie はログに含めない(プライバシー)
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // 日本を含むクラス(コスト最適化)
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.distribution).add(k, v));

    // CloudFront cdk-nag 抑制
    NagSuppressions.addResourceSuppressions(this.distribution, [
      {
        id: 'AwsSolutions-CFR1',
        reason:
          'CloudFront distribution uses geo restriction opt-out. ' +
          'System serves Japan municipal facility, no geo-restriction needed. ' +
          'WAF handles rate limiting and IP restrictions for staff.',
      },
      {
        id: 'AwsSolutions-CFR2',
        reason:
          'WAF is associated via webAclId=webAcl.attrArn. ' +
          'NFR-E05準拠: AWSマネージドルール+レートベースルール+IP制限を設定済み。',
      },
      {
        id: 'AwsSolutions-CFR3',
        reason:
          'Access logs are enabled. enableLogging=true, logBucket=logBucketRef. ' +
          'NFR-E06: ログ保管1年以上の設定はログバケットのライフサイクルで管理。',
      },
      {
        id: 'AwsSolutions-CFR5',
        reason:
          'ALB origins use protocolPolicy=HTTPS_ONLY with httpsPort=443. ' +
          'CDK LoadBalancerV2Origin enforces HTTPS to origin. ' +
          'TLS termination at ALB uses ACM certificate. ' +
          'minimumProtocolVersion=TLS_V1_2_2021 is set for viewer-facing connections.',
      },
    ]);

    // SPA バケット cdk-nag 抑制
    NagSuppressions.addResourceSuppressions(this.spaBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'SPA bucket serves only static assets (HTML/JS/CSS). ' +
          'Access is controlled via CloudFront OAC and bucket policy (ServicePrincipal=cloudfront.amazonaws.com). ' +
          'CloudFront access logs are captured at distribution level (enableLogging=true). ' +
          'Direct S3 access is blocked (BlockPublicAccess.BLOCK_ALL + enforceSSL=true).',
      },
    ]);

    // ── アウトプット ────────────────────────────────────
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      exportName: `yoyaku-${env}-cf-dist-id`,
    });
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      exportName: `yoyaku-${env}-cf-domain`,
    });
    new cdk.CfnOutput(this, 'SpaBucketName', {
      value: this.spaBucket.bucketName,
      exportName: `yoyaku-${env}-s3-spa-name`,
    });
    new cdk.CfnOutput(this, 'WebAclArn', {
      value: this.webAcl.attrArn,
      exportName: `yoyaku-${env}-waf-arn`,
    });
  }
}
