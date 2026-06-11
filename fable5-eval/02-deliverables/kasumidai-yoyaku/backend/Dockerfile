# 霞台市公共施設予約管理システム バックエンド Dockerfile
# Java 21 マルチステージビルド・非rootユーザー実行
# KSM-DEV-001 §7: コンテナセキュリティ基準準拠
# ※ローカルJavaビルド禁止(発注者指示)のため、DockerfileによるビルドはCodeBuildで実施

# ── ステージ1: ビルド ──────────────────────────────────────────────
# DockerHub rate limit 回避のため ECR Public Gallery の Amazon Corretto を使用(KSM-ENV-001)
FROM public.ecr.aws/amazoncorretto/amazoncorretto:21-al2023 AS builder

WORKDIR /workspace

# Maven インストール(AL2023 は dnf を使用)
RUN dnf install -y maven \
    && dnf clean all

# ビルドコンテキストはモノレポルート(fable5-eval/02-deliverables/kasumidai-yoyaku/)を想定
# pom.xml と依存関係を先にコピーしてレイヤーキャッシュを活用
COPY backend/pom.xml ./
# 依存関係をキャッシュ
RUN mvn dependency:go-offline -B

# ソースコードとCheckstyle設定をコピー
# standards は pom.xml から ../standards/checkstyle.xml として参照される
# (WORKDIR=/workspace の親=/の子)
COPY backend/src ./src
COPY standards /standards

# jar のビルド(Checkstyle/ArchUnit/JUnit/JaCoCoはCodeBuildのbuildspecで実施済みのためスキップ)
# -Dmaven.test.skip=true はテストのコンパイルと実行の両方をスキップ(-DskipTestsはコンパイルのみ)
RUN mvn package -B -Dmaven.test.skip=true

# ── ステージ2: 実行イメージ ────────────────────────────────────────
# DockerHub rate limit 回避のため ECR Public Gallery の Amazon Corretto を使用(KSM-ENV-001)
# JREのみのイメージがないため JDK イメージを使用(AL2023 ベース)
FROM public.ecr.aws/amazoncorretto/amazoncorretto:21-al2023 AS runtime

# セキュリティ: 非rootユーザーで実行(KSM-DEV-001 §7)
# Amazon Corretto AL2023 イメージには curl-minimal が既インストール済み。
# curl パッケージは curl-minimal と競合するためインストール不要。
# shadow-utils(useradd/groupadd)はランタイムイメージに含まれないためインストール。
RUN dnf install -y shadow-utils \
    && dnf clean all \
    && groupadd --system --gid 1001 appgroup \
    && useradd --system --uid 1001 --gid appgroup --no-create-home appuser

WORKDIR /app

# ビルドステージから jar をコピー
COPY --from=builder /workspace/target/*.jar app.jar

# ファイルの所有権を appuser に変更
RUN chown -R appuser:appgroup /app

USER appuser

# ヘルスチェック(KSM-DEV-001: コンテナヘルスチェック)
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/api/actuator/health || exit 1

EXPOSE 8080

ENTRYPOINT ["java", \
    "-Xms256m", "-Xmx768m", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-jar", "app.jar"]
