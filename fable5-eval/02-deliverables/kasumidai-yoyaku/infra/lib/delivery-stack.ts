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
    // stg環境: staffAllowedCidrs=['0.0.0.0/0'] の場合は WAFv2 が 0.0.0.0/0 を拒否するため
    // IP制限ルール自体をスキップする(stgはIP制限なしで全許可)
    const isIpRestrictionEnabled =
      params.staffAllowedCidrs.length > 0 &&
      !params.staffAllowedCidrs.includes('0.0.0.0/0');

    let staffIpSet: wafv2.CfnIPSet | undefined;
    if (isIpRestrictionEnabled) {
      staffIpSet = new wafv2.CfnIPSet(this, 'StaffIpSet', {
        name: `yoyaku-${env}-ipset-staff`,
        description: 'Staff access allowed CIDRs - QA No.17 14 offices',
        scope: 'CLOUDFRONT',
        ipAddressVersion: 'IPV4',
        addresses: params.staffAllowedCidrs,
      });
      Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(staffIpSet!).add(k, v));
    }

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
        // stg環境(staffAllowedCidrs=['0.0.0.0/0'])はIP制限をスキップ(全許可)
        // prod環境は isIpRestrictionEnabled=true になるため必ず適用される
        ...(isIpRestrictionEnabled && staffIpSet
          ? [
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
            ]
          : []),
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

    // カスタムドメイン・証明書の設定(stg環境ではドメイン未取得のため省略可)
    const distributionDomainConfig = params.domainName && params.certificateArn
      ? {
          domainNames: [params.domainName],
          certificate: acm.Certificate.fromCertificateArn(
            this, 'Certificate', params.certificateArn,
          ),
        }
      : {};

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `yoyaku-${env} CloudFront distribution`,
      // SPA: ルート URL で index.html を返す
      defaultRootObject: 'index.html',
      // SPA: ルーティング - 403/404 は index.html に転送(React Router 対応)
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
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
            // stg(証明書なし): CloudFront→ALB 間は HTTP(port 80)
            // prod(証明書あり): HTTPS_ONLY(port 443)
            protocolPolicy: params.certificateArn
              ? cloudfront.OriginProtocolPolicy.HTTPS_ONLY
              : cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpsPort: params.certificateArn ? 443 : undefined,
            httpPort: params.certificateArn ? undefined : 80,
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
            protocolPolicy: params.certificateArn
              ? cloudfront.OriginProtocolPolicy.HTTPS_ONLY
              : cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpsPort: params.certificateArn ? 443 : undefined,
            httpPort: params.certificateArn ? undefined : 80,
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
      ...distributionDomainConfig,
      webAclId: this.webAcl.attrArn,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      // CloudFront アクセスログ:
      // ログバケットは KMS 暗号化のため CloudFront からの書き込みが不可(ACL 必須・KMS 非対応)。
      // stg 環境ではアクセスログを無効化する。
      // prod 環境では ACL 有効・SSE-S3 専用の CloudFront ログバケットを別途作成すること(P4 課題)。
      // 参照: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/AccessLogs.html
      enableLogging: false,
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
          'CloudFront access logs are disabled for stg environment. ' +
          'The existing log bucket uses KMS encryption which CloudFront does not support for access logs ' +
          '(CloudFront requires ACL-enabled SSE-S3 bucket). ' +
          'For prod: create a dedicated CloudFront log bucket with ACL enabled and SSE-S3. ' +
          'KSM-ENV-001: stg環境はアクセスログ無効化(ログバケットKMS制約回避)。',
      },
      {
        id: 'AwsSolutions-CFR4',
        reason:
          'stg環境: ドメイン未取得のため ACM 証明書が存在せず CloudFront デフォルト証明書を使用。' +
          'デフォルト証明書では SslSupportMethod=sni-only の設定に制約があり、' +
          'minimumProtocolVersion=TLS_V1_2_2021 は証明書設定時に有効となる。' +
          'stg環境は受注者開発チームのみアクセスする内部検証環境であり、' +
          'TLS最小バージョン規約(KSM-BDD-001 §4.3)はprod環境に適用する。' +
          'prod環境では ACM 証明書設定とともに minimumProtocolVersion=TLS_V1_2_2021 が有効になる。',
      },
      {
        id: 'AwsSolutions-CFR5',
        reason:
          'stg環境: CloudFront→ALB 間は HTTP_ONLY(ALBに証明書未設定のため)。' +
          'CloudFront エッジで HTTPS を終端し、内部通信はセキュリティグループで保護。' +
          'prod環境では ALB に ACM 証明書を設定し HTTPS_ONLY で通信する(KSM-BDD-001 §4.3)。',
      },
    ]);

    // SPA バケット cdk-nag 抑制
    NagSuppressions.addResourceSuppressions(this.spaBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'SPA bucket serves only static assets (HTML/JS/CSS). ' +
          'Access is controlled via CloudFront OAC and bucket policy (ServicePrincipal=cloudfront.amazonaws.com). ' +
          'CloudFront access logs disabled for stg (KMS log bucket incompatibility). ' +
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
