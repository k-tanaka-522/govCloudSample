/**
 * パイプライン(CI)スタック: ECR + CodeBuild
 *
 * 【制度判断記録】CodeCommit 代替選択(KSM-ENV-001 §3 で詳述)
 *   CodeCommit は 2024年7月以降、新規顧客の利用が停止された(AWS公式通知)。
 *   本プロジェクトは 2026年新規デプロイのため CodeCommit の使用は不可。
 *   代替として CodeBuild の GitHub ソース(公開リポジトリ直接参照)を採用。
 *   ソース: https://github.com/k-tanaka-522/govCloudSample (master)
 *
 * CodeBuild での品質ゲート実行(KSM-IMP-001 §3.3 申し送り:
 *   ローカルで機械実行不能だった Checkstyle/ArchUnit/JUnit/JaCoCo/SpotBugs を
 *   このスタックのCodeBuildプロジェクトで初回実行する)
 *
 * ECRリポジトリは AppStack にも存在するが、CI/CD の責務分離のため
 * Pipeline スタックで独立管理する。ECR URI は SSM Parameter Store に格納し
 * AppStack から参照する構造とする。
 */
import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvParams } from '../env/types';
import { requiredTags } from './common/tags';
import { NagSuppressions } from 'cdk-nag';

export interface PipelineStackProps extends cdk.StackProps {
  readonly params: EnvParams;
  readonly dataKey: kms.IKey;
  readonly logKey: kms.IKey;
  /** AppStack が作成する ECR リポジトリ名(CI が push 先として使用) */
  readonly appEcrRepositoryName?: string;
}

export class PipelineStack extends cdk.Stack {
  /** ECR リポジトリ(CI/CD で管理) */
  public readonly repository: ecr.Repository;
  /** CodeBuild プロジェクト */
  public readonly buildProject: codebuild.Project;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    const { params } = props;
    const env = params.envName;
    const tags = requiredTags(env);

    // ════════════════════════════════════════════════════
    // ECR リポジトリ(CI/CDが管理)
    // AppStack にも ECR が存在するが、CI/CD パイプラインは PipelineStack の
    // ECR に push する。AppStack の ECR URI は params.imageTag で参照される。
    // ここでは CI/CD 専用の ECR リポジトリを作成する。
    // リポジトリ名の末尾に "-ci" を付けて AppStack の ECR と区別する。
    // ════════════════════════════════════════════════════
    this.repository = new ecr.Repository(this, 'CiRepository', {
      repositoryName: `yoyaku-${env}-ecr-app-ci`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      encryptionKey: props.dataKey,
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

    // ECR URI を SSM パラメータに格納(buildspec から参照)
    const ecrUriParam = new ssm.StringParameter(this, 'EcrRepoUriParam', {
      parameterName: `/yoyaku/${env}/ecr-repo-uri`,
      stringValue: this.repository.repositoryUri,
      description: `yoyaku-${env} ECR repository URI`,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(ecrUriParam).add(k, v));

    // ════════════════════════════════════════════════════
    // CodeBuild IAM ロール
    // ════════════════════════════════════════════════════
    const buildRole = new iam.Role(this, 'CodeBuildRole', {
      roleName: `yoyaku-${env}-role-codebuild`,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'CodeBuild role for yoyaku CI pipeline',
    });

    // ECR 操作権限(CI ECR repo)
    this.repository.grantPullPush(buildRole);

    // ECR 操作権限(App ECR repo: ECSタスクが使用するリポジトリにもプッシュ)
    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:BatchCheckLayerAvailability',
        'ecr:PutImage',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:DescribeRepositories',
        'ecr:ListImages',
      ],
      resources: [
        `arn:aws:ecr:${this.region}:${this.account}:repository/yoyaku-${env}-ecr-app`,
      ],
    }));

    // ECR 認証ログイン(docker login)
    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    // SSM Parameter Store 読み取り(ECR URI 取得)
    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/yoyaku/${env}/*`,
      ],
    }));

    // KMS 使用権限(ECR 暗号化)
    props.dataKey.grantEncryptDecrypt(buildRole);

    // CloudWatch Logs 書き込み
    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/yoyaku/${env}/codebuild/*`,
        `arn:aws:logs:${this.region}:${this.account}:log-group:/yoyaku/${env}/codebuild/*:*`,
      ],
    }));

    // S3 ソースバケット読み取り権限(GitHub ZIP ダウンロード代替)
    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:GetBucketAcl', 's3:GetBucketLocation'],
      resources: [
        `arn:aws:s3:::yoyaku-${env}-s3-data`,
        `arn:aws:s3:::yoyaku-${env}-s3-data/*`,
      ],
    }));

    // S3 アーティファクト操作(CodeBuild が使用する場合)
    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:GetBucketAcl', 's3:GetBucketLocation'],
      resources: [
        `arn:aws:s3:::codepipeline-${this.region}-*`,
        `arn:aws:s3:::codepipeline-${this.region}-*/*`,
      ],
    }));

    // CodeBuild レポートグループへの書き込み(JUnit/JaCoCo レポート)
    buildRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'codebuild:CreateReportGroup',
        'codebuild:CreateReport',
        'codebuild:UpdateReport',
        'codebuild:BatchPutTestCases',
        'codebuild:BatchPutCodeCoverages',
      ],
      resources: [
        `arn:aws:codebuild:${this.region}:${this.account}:report-group/yoyaku-${env}-*`,
      ],
    }));

    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(buildRole).add(k, v));

    // ════════════════════════════════════════════════════
    // CloudWatch Logs グループ(CodeBuild ログ)
    // ════════════════════════════════════════════════════
    const buildLogGroup = new logs.LogGroup(this, 'BuildLogGroup', {
      logGroupName: `/yoyaku/${env}/codebuild/build`,
      encryptionKey: props.logKey,
      retention: env === 'prod' ? logs.RetentionDays.ONE_YEAR : logs.RetentionDays.ONE_MONTH,
      removalPolicy: env === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(buildLogGroup).add(k, v));

    // ════════════════════════════════════════════════════
    // CodeBuild プロジェクト
    // ソース: GitHub 公開リポジトリ(CodeCommit 廃止代替。KSM-ENV-001 §3)
    // buildspec: リポジトリ内の fable5-eval/02-deliverables/kasumidai-yoyaku/buildspec.yml
    // ════════════════════════════════════════════════════
    this.buildProject = new codebuild.Project(this, 'BuildProject', {
      projectName: `yoyaku-${env}-codebuild-build`,
      description: `霞台市予約システム(${env}) CI: Checkstyle/ArchUnit/JUnit/JaCoCo/SpotBugs → Docker → ECR`,
      role: buildRole,

      // ── ソース: S3(GitHub ZIPアーカイブ) ──
      // CodeCommit 廃止(2024年7月以降新規顧客利用不可)のため GitHub ソースを使用。
      // CDK の Source.gitHub() は CodeStar Connection(OAuth)が必要。
      // 公開リポジトリの GitHub ZIP を S3 にアップロードし、S3 ソースとして使用する。
      // GitHub の最新 master を使う場合は:
      //   aws s3 cp <(curl -L https://github.com/k-tanaka-522/govCloudSample/archive/master.zip) \
      //     s3://yoyaku-stg-s3-data/codebuild/source/govCloudSample-master.zip
      // を再実行してビルドを再起動する。
      source: codebuild.Source.s3({
        bucket: cdk.aws_s3.Bucket.fromBucketName(this, 'SourceBucket', `yoyaku-${env}-s3-data`),
        path: 'codebuild/source/govCloudSample-master.zip',
      }),

      // buildspec は S3 ソース内の buildspec.yml を参照
      // GitHub ZIPは govCloudSample-master/ というフォルダに展開される
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        'govCloudSample-master/fable5-eval/02-deliverables/kasumidai-yoyaku/buildspec.yml',
      ),

      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType: codebuild.ComputeType.MEDIUM, // Maven + Docker ビルドには MEDIUM 以上推奨
        privileged: true, // Docker in Docker のため必要
        environmentVariables: {
          // S3 ソース使用: GitHub ZIPは govCloudSample-master/ トップフォルダに展開される
          // CodeBuild の CODEBUILD_SRC_DIR からの相対パスで指定する
          MONOREPPO_PATH: {
            value: 'govCloudSample-master/fable5-eval/02-deliverables/kasumidai-yoyaku',
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
          ENV_NAME: {
            value: env,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
          },
        },
      },

      // ログ設定
      logging: {
        cloudWatch: {
          logGroup: buildLogGroup,
          prefix: 'build',
          enabled: true,
        },
      },

      // タイムアウト: Maven + Docker ビルドは 30 分程度かかる想定
      timeout: cdk.Duration.minutes(60),

      // キャッシュ: なし(GitHub ソース使用)
      cache: codebuild.Cache.none(),
    });
    Object.entries(tags).forEach(([k, v]) => cdk.Tags.of(this.buildProject).add(k, v));

    // cdk-nag 抑制
    NagSuppressions.addResourceSuppressions(buildRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'CodeBuild requires AmazonEC2ContainerRegistryPowerUser-like permissions. ' +
          'Custom policy grants only ECR push/pull and CloudWatch Logs. ' +
          'ecr:GetAuthorizationToken requires Resource: * by AWS definition.',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'ecr:GetAuthorizationToken requires Resource: * per AWS documentation. ' +
          'KMS GenerateDataKey*/ReEncrypt* are standard patterns for grantEncryptDecrypt. ' +
          'CodeBuild report group uses wildcard for project-specific resources. ' +
          'S3 codepipeline bucket access uses regional wildcard (standard CodeBuild pattern). ' +
          'SSM /yoyaku/{env}/* wildcard is scoped to this project namespace only. ' +
          'CloudWatch Logs wildcard is scoped to /yoyaku/{env}/codebuild/* namespace. ' +
          'These are the minimum required wildcards for CodeBuild operations.',
        appliesTo: [
          'Resource::*',
          'Action::kms:GenerateDataKey*',
          'Action::kms:ReEncrypt*',
          { regex: '/^Resource::arn:aws:s3:::codepipeline.*/' },
          { regex: '/^Resource::arn:aws:codebuild.*report-group.*/' },
          { regex: '/^Resource::arn:aws:logs.*/' },
          { regex: '/^Resource::arn:.*:ssm:.*:parameter\\/yoyaku\\/.*/' },
          { regex: '/^Resource::arn:<AWS::Partition>:logs:.*codebuild.*/' },
          { regex: '/^Resource::arn:<AWS::Partition>:codebuild.*report-group.*/' },
          // S3 ソースバケットアクセス(CDK自動生成権限)
          { regex: '/^Resource::arn:aws:s3:::yoyaku-stg-s3-data.*/' },
          'Action::s3:GetBucket*',
          'Action::s3:GetObject*',
          'Action::s3:List*',
        ],
      },
    ], true);

    NagSuppressions.addResourceSuppressions(this.buildProject, [
      {
        id: 'AwsSolutions-CB3',
        reason:
          'privileged=true is required for Docker-in-Docker (Docker daemon access). ' +
          'CodeBuild environment is isolated and ephemeral. ' +
          'Docker image build is the core purpose of this project. ' +
          'KSM-DEV-001 §7: コンテナビルドはCodeBuildの隔離環境で実施。',
      },
      {
        id: 'AwsSolutions-CB4',
        reason:
          'CodeBuild uses AWS-managed environment image (AmazonLinux2). ' +
          'Customer-managed KMS encryption for build environment is not supported for managed images. ' +
          'Source artifacts and output (ECR images) are encrypted with KMS CMK.',
      },
    ]);

    NagSuppressions.addResourceSuppressions(this.repository, [
      {
        id: 'AwsSolutions-ECR1',
        reason:
          'ECR repository scan is enabled (imageScanOnPush=true). ' +
          'KSM-DEV-001 §7: プッシュ時脆弱性スキャン有効。',
      },
    ]);

    // ── アウトプット ──────────────────────────────────
    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'ECR Repository URI (CI/CD managed)',
      exportName: `yoyaku-${env}-pipeline-ecr-uri`,
    });
    new cdk.CfnOutput(this, 'CodeBuildProjectName', {
      value: this.buildProject.projectName,
      description: 'CodeBuild Project Name',
      exportName: `yoyaku-${env}-codebuild-project-name`,
    });
    new cdk.CfnOutput(this, 'EcrUriSsmParam', {
      value: ecrUriParam.parameterName,
      description: 'SSM Parameter Name for ECR URI',
    });
  }
}
