# 開発標準書

霞台市公共施設予約管理システム構築及び運用保守業務(霞情政第126号)

| 項目 | 内容 |
|---|---|
| 文書番号 | KSM-DEV-001 |
| 版 | 1.0(初版) |
| 作成日 | 令和8年6月10日 |
| 作成者 | 受注者(当社)リードA(アーキテクト) |
| 承認 | 発注者検収待ち(G2) |
| 関連文書 | KSM-BDD-001(基本設計書)、KSM-REP-001(リポジトリ戦略)、KSM-ADR-006/007、CLAUDE.md(判断成果物の義務:機械的強制手段の同梱) |
| 付属設定ファイル | 02-deliverables/dev-standards/ 配下(本書§8の一覧) |

## 改版履歴

| 版 | 日付 | 改版内容 | 作成・承認 |
|---|---|---|---|
| 1.0 | 令和8年6月10日 | 初版作成(P2)。コーディング規約・命名規則・レイヤー構成と、各規約に対応する機械的強制設定ファイル一式を同梱 | 当社リードA/発注者検収待ち |

---

## 1. 基本原則

1. **規約は機械で強制する**:本書のすべての規約は、CIで自動実行される検査(linter・静的解析・アーキテクチャテスト)と対になっている。検査で強制できない規約は「推奨」と明示し、レビュー観点表で扱う。
2. **違反ゼロが完了条件**:実装フェーズ(P4)では、§8の検査一式をCIのマージブロック条件とし、**違反ゼロ**をもって実装完了とする(CLAUDE.md義務)。例外承認は理由コメント+リードAのレビュー承認を必須とし、件数をPMOが月次報告する。
3. **対象**:バックエンド(Java 21+Spring Boot)、フロントエンド(TypeScript+React)、IaC(TypeScript+AWS CDK)、移行ツール(Java)。

## 2. レイヤー構成と依存方向(全コード共通)

UI→アプリケーション→ドメイン→インフラの**一方向依存・隣接層のみ参照可**とする(CLAUDE.md義務)。逆方向・飛び越し・循環参照を禁止し、ArchUnit(Java)/dependency-cruiser(TypeScript)で機械検査する。

| 層 | 役割 | Javaパッケージ | TSディレクトリ |
|---|---|---|---|
| UI(presentation) | REST APIコントローラ、リクエスト/レスポンスDTO、画面(React) | `jp.lg.kasumidai.yoyaku.presentation` | `src/ui/` |
| アプリケーション | ユースケース(予約申込、抽選実行、減免承認等)、トランザクション境界 | `...yoyaku.application` | `src/application/` |
| ドメイン | 業務ルール(予約上限、料金算定、抽選規則)、エンティティ・値オブジェクト | `...yoyaku.domain` | `src/domain/` |
| インフラ | DBアクセス(リポジトリ実装)、外部IF(決済・SES・S3)、設定 | `...yoyaku.infrastructure` | `src/infrastructure/` |

- レイヤードアーキテクチャの依存検査はArchUnitの`layeredArchitecture()`定義[^1]、TS側はdependency-cruiserのルール定義[^2]による(付属ファイル実体が正)。
- 循環依存はパッケージ/モジュール単位で禁止(両ツールで検査)。

## 3. 共通コーディング規約

| # | 規約 | 機械的強制手段(付属ファイル) |
|---|---|---|
| 3-1 | **循環的複雑度はメソッド/関数あたり10以内**。10超はCIで失敗 | Java: Checkstyle `CyclomaticComplexity max=10`(checkstyle.xml)/TS: ESLint `complexity: ["error", 10]`(eslint.config.mjs)。根拠:McCabe/NIST SP 500-235は上限10に有意な裏付けがあるとする[^3] |
| 3-2 | メソッド/関数は80行以内、ファイルは500行以内 | Checkstyle `MethodLength`/ESLint `max-lines-per-function`・`max-lines` |
| 3-3 | ネスト深さ4以内 | Checkstyle `NestedIfDepth`等/ESLint `max-depth` |
| 3-4 | マジックナンバー禁止(定数化) | Checkstyle `MagicNumber`/ESLint `no-magic-numbers`(0,1等を除外) |
| 3-5 | 文字コードUTF-8・改行LF(REQ-027整合) | EditorConfig+CIのエンコーディング検査 |
| 3-6 | TODO/FIXMEを残したマージ禁止(課題管理表へ起票) | CI grep検査(ci-quality-gate.yml) |

## 4. 命名規則

Google Java Style Guide[^4](Java)およびtypescript-eslintの`naming-convention`ルール[^5](TS)を基底とし、次を強制する。

| 対象 | 規則 | 例 | 強制手段 |
|---|---|---|---|
| Javaクラス/TS型・コンポーネント | UpperCamelCase | `ReservationService`、`LotteryEntry` | Checkstyle `TypeName`/ESLint `naming-convention` |
| メソッド・変数・関数 | lowerCamelCase | `calculateFee` | Checkstyle `MethodName`・`MemberName`/同上 |
| 定数 | UPPER_SNAKE_CASE | `MAX_SLOTS_PER_MONTH` | Checkstyle `ConstantName`/同上 |
| Javaパッケージ | 小文字ドット区切り `jp.lg.kasumidai.yoyaku.<layer>.<業務領域>` | `...domain.lottery` | Checkstyle `PackageName` |
| DBテーブル・カラム | snake_case(物理名は英語。日本語論理名はDB設計書で対管理) | `reservation_slot` | スキーマレビュー+マイグレーションのCI検査(P3で追加) |
| REST API | パスは複数形名詞・ケバブ小文字。**職員向けは `/api/staff/` 配下に限定**(NFR-E08のWAF IP制限と整合。KSM-ADR-003) | `/api/staff/facilities` | OpenAPI定義のlint(P3で追加) |
| AWSリソース | `yoyaku-{env}-{role}`(steering/iac規約2) | `yoyaku-prod-db` | cdk-nagカスタムルール |
| 用語 | 業務用語はP1用語集の英語名を正とし、同義語の混在禁止(例:予約=reservation。booking不可) | − | レビュー観点(推奨)+用語集の辞書をESLint/Checkstyleの禁止語に段階追加 |

## 5. 言語別規約

### 5.1 Java(バックエンド・移行ツール)

- Google Java Style Guide[^4]準拠(行長のみ120桁に変更:理由=日本語コメントの実用性。Checkstyleで強制)。
- 例外:業務例外(`DomainException`系)と技術例外を区別し、握りつぶし(空catch)禁止(Checkstyle `EmptyCatchBlock`)。
- DTO/エンティティの相互変換はアプリケーション層で行い、エンティティをUI層へ直接公開しない(ArchUnitで`domain`→`presentation`参照禁止により担保)。
- トランザクション境界は`application`層のユースケースクラスのみ(`@Transactional`の配置をArchUnitで検査)。

### 5.2 TypeScript(フロントエンド・IaC)

- `strict: true`(tsconfig)。`any`の使用は理由コメント付きの明示的エスケープのみ(ESLint `no-explicit-any`)。
- React:関数コンポーネント+Hooksのみ。アクセシビリティ(REQ-014:JIS X 8341-3:2016 AA[^6])のため `eslint-plugin-jsx-a11y` を有効化し、稼働前試験(P5)と二段構えとする。
- IaC(CDK):AWS公式ベストプラクティス[^7]に従い、ステートフルリソースのスタック分離・cdk-nagエラー0(KSM-ADR-006)。

### 5.3 セキュア実装標準(NFR-E04)

OWASP Top 10:2025[^8]の各項目に対する実装規約(入力検証・出力エスケープ・SQLはプリペアドステートメントのみ・認可の二重検査・秘匿情報のログ出力禁止等)を定め、次で機械検査する:SAST(SpotBugs+FindSecurityBugs/ESLintセキュリティルール)、依存ライブラリ脆弱性検査(OWASP Dependency-Check/npm audit)をCIに組み込み、Critical/High検出はマージブロック。詳細規約表はP3詳細設計書の付録で確定し、本書の検査基盤(§8)に追加する。

## 6. レビュー基準

1. 全変更はPR必須・レビュア1名以上(IaC=基盤チームリード必須、セキュリティ設定=リードA必須。CODEOWNERS:KSM-REP-001)。
2. 機械検査(§8)がグリーンであることがレビュー開始条件(人はロジック・業務整合・設計適合のみを見る)。
3. レビュー観点表(業務ルール整合・トランザクション境界・性能(N+1等)・アクセシビリティ)はP3で詳細化。

## 7. CI構成(マージブロック)

mainへのマージ条件(必須チェック):

| ジョブ | 内容 | 失敗条件 |
|---|---|---|
| backend-quality | Checkstyle→単体テスト(ArchUnit含む)→SpotBugs | 規約違反1件以上/テスト失敗/複雑度10超 |
| frontend-quality | ESLint(警告0)→tsc→dependency-cruiser→単体テスト | 同上+依存方向違反 |
| iac-quality | ESLint→cdk synth→cdk-nag→assertionsテスト | cdk-nagエラー1件以上 |
| security | 依存脆弱性検査(Dependency-Check/npm audit) | Critical/High検出 |

実体は付属の `ci-quality-gate.yml`(P4でリポジトリの `.github/workflows/` へ配置)。

## 8. 付属設定ファイル一覧(02-deliverables/dev-standards/)

| ファイル | 強制する規約 |
|---|---|
| `checkstyle.xml` | Java命名規則(§4)、複雑度10(§3-1)、行長・メソッド長・ネスト・マジックナンバー(§3)、空catch禁止(§5.1) |
| `archunit/LayeredArchitectureTest.java` | レイヤー依存方向(§2)、循環依存禁止、`@Transactional`配置(§5.1) |
| `eslint.config.mjs` | TS命名規則(§4)、複雑度10(§3-1)、関数長・ネスト(§3)、`no-explicit-any`、jsx-a11y(§5.2) |
| `dependency-cruiser.cjs` | TSレイヤー依存方向(§2)、循環依存禁止 |
| `ci-quality-gate.yml` | §7のCIブロック構成(複雑度10超・依存方向違反・cdk-nagエラーのマージブロック) |
| `.editorconfig` | UTF-8・LF・インデント(§3-5) |

---

## 脚注(規約根拠の出典。いずれもWeb検索で現行版を確認)

[^1]: TNG「ArchUnit User Guide」(`layeredArchitecture()`によるレイヤー依存検査)。https://www.archunit.org/userguide/html/000_Index.html (参照日:令和8年6月10日)
[^2]: sverweij「dependency-cruiser」(依存ルールの定義・検証。rules reference)。https://github.com/sverweij/dependency-cruiser (参照日:令和8年6月10日)
[^3]: NIST Special Publication 500-235 "Structured Testing: A Testing Methodology Using the Cyclomatic Complexity Metric"(1996)。「上限10には有意な裏付けがある。10超の上限は、経験豊富な要員・形式的設計等の運用上の優位がある場合に限る」。https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication500-235.pdf (参照日:令和8年6月10日)
[^4]: Google「Google Java Style Guide」および Checkstyle公式のGoogleスタイル対応設定。https://google.github.io/styleguide/javaguide.html 、https://checkstyle.sourceforge.io/google_style.html (参照日:令和8年6月10日)
[^5]: typescript-eslint「naming-convention」ルール。https://typescript-eslint.io/rules/naming-convention/ 、ESLint「complexity」ルール(循環的複雑度の上限指定)。https://eslint.org/docs/latest/rules/complexity (参照日:令和8年6月10日)
[^6]: JIS X 8341-3:2016 解説(ウェブアクセシビリティ基盤委員会(WAIC))。https://waic.jp/docs/jis2016/understanding/ (参照日:令和8年6月10日)
[^7]: AWS「Best practices for using the AWS CDK in TypeScript to create IaC projects」(AWS Prescriptive Guidance)。https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-cdk-typescript-iac/introduction.html (参照日:令和8年6月10日)
[^8]: OWASP Foundation「OWASP Top 10:2025」。https://owasp.org/Top10/2025/ (参照日:令和8年6月10日)

以上
