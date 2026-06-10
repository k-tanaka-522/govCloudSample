# リポジトリ戦略書

霞台市公共施設予約管理システム構築及び運用保守業務(霞情政第126号)

| 項目 | 内容 |
|---|---|
| 文書番号 | KSM-REP-001 |
| 版 | 1.0(初版) |
| 作成日 | 令和8年6月10日 |
| 作成者 | 受注者(当社)リードA+基盤チームリード |
| 承認 | 発注者検収待ち(G2) |
| 関連文書 | **KSM-ADR-007(リポジトリ戦略。決定の正)**、KSM-ADR-006(IaCツール)、KSM-ORG-001(体制設計・責任分界表)、KSM-DEV-001(開発標準書)、KSM-BDD-001 §2.3/§3.3、steering/iac/iac-standards.md 規約1 |

## 改版履歴

| 版 | 日付 | 改版内容 | 作成・承認 |
|---|---|---|---|
| 1.0 | 令和8年6月10日 | 初版作成(P2)。KSM-ADR-007の決定(モノレポ・パラメータ管理・トランクベース)を運用可能な構成・統制ルールとして具体化 | 当社リードA/発注者検収待ち |

---

## 1. 位置付けと決定事項(KSM-ADR-007 の再掲)

本書は、ADR(KSM-ADR-007)で決定したリポジトリ戦略を、ディレクトリ構成・ブランチ運用・所有統制(CODEOWNERS)のレベルで具体化する実施文書である。決定の根拠・選択肢比較・却下理由は KSM-ADR-007 を正とする。

1. **モノレポ**:単一リポジトリ `kasumidai-yoyaku` にアプリケーション(フロントエンド・バックエンド)、IaC(CDK)、移行ツール、CI/CD定義、ドキュメントを同居させる。
2. **環境差分はパラメータ管理**(`infra/env/{prod,stg,dev}.ts`)。コード分岐・環境ブランチ・ディレクトリ複製は禁止(steering/iac規約1)。
3. **トランクベース開発**:main+短命フィーチャブランチ、PR必須・CI必須。リリースはタグ+同一アーティファクト(コンテナイメージ/CDK合成結果)の dev→stg→prod 昇格。

根拠(体制整合):本プロジェクトは独立したインフラチームを持たない単一統合チーム(KSM-ORG-001)であり、IaCはアプリ部がCDK(TypeScript)で内製する(KSM-ADR-006)。アプリとインフラの連動変更(例:職員パス追加+WAFルール変更)を1PRで原子的にレビューできる構成が体制の実態に一致する。

## 2. リポジトリ構成

```
kasumidai-yoyaku/                  ※ リポジトリは本1系統のみ
├─ frontend/                      # React SPA(TypeScript)
│   └─ src/{ui,application,domain,infrastructure}/   # KSM-DEV-001 §2 のレイヤー構成
├─ backend/                       # Spring Boot(Java 21)。API・ワーカー・バッチ同一コードベース(起動プロファイル差替え)
│   └─ src/main/java/jp/lg/kasumidai/yoyaku/{presentation,application,domain,infrastructure}/
│   └─ src/main/resources/db/migration/   # DBマイグレーション(スキーマ変更)
├─ migration-tool/                # 現行データ移行ツール(Java。REQ-028)
├─ infra/                         # IaC(AWS CDK・TypeScript。KSM-ADR-006)
│   ├─ env/{prod,stg,dev}.ts      # 環境別パラメータ(IP許可リスト・スケール値・TTL等の運用変更を含む)
│   ├─ security/                  # WAF・IAM・KMS・SG・Cognitoポリシー(統制対象を集約)
│   └─ docs/resource-map.md       # 構成図⇔IaC 1:1対応表(steering/iac規約5。KSM-BDD-001 §3.3)
├─ .github/workflows/             # CI/CD(ci-quality-gate.yml を P4 で配置。KSM-DEV-001 §7)
└─ docs/                          # 設計書類・運用ドキュメント(レイアウト定義書等)
```

## 3. ブランチ・リリース運用

| 項目 | 規則 |
|---|---|
| 既定ブランチ | `main`(常時リリース可能。直接push禁止) |
| 作業ブランチ | 短命フィーチャブランチ(`feature/REQ-xxx-…` 等、要件ID・課題IDを名称に含めトレーサビリティ確保) |
| マージ条件 | PR必須・レビュア1名以上(KSM-DEV-001 §6)+必須CIチェック(同 §7)グリーン |
| リリース | タグ(`vX.Y.Z`)を起点に同一アーティファクトを dev→stg→prod へ昇格。環境ごとの再ビルド禁止 |
| 環境差分 | `infra/env/*.ts` のパラメータのみで表現。環境ブランチ・ディレクトリ複製・コード分岐は禁止 |
| 緊急修正 | mainからのホットフィックスブランチ→同一フロー(CI・レビュー省略不可)。IaCの緊急手作業変更は事後24時間以内にIaC反映+記録(KSM-ADR-006 決定4) |

## 4. 所有・レビュー統制(CODEOWNERS による一意性の機械的強制)

KSM-ORG-001 §3.1(境界成果物の所有者一意化)をリポジトリ機構で強制する。

| パス | 必須承認者(CODEOWNERS) | 対応するRACI(KSM-ORG-001) |
|---|---|---|
| `infra/`(全体) | 基盤チームリード | IaC・CI/CD・監視設定のA=基盤チームリード |
| `infra/security/`(WAF・IAM・KMS・SG・Cognitoポリシー) | リードA(基盤チームリードの承認に追加) | セキュリティ設定のA=リードA(設計判断と実装の分離) |
| `backend/**/db/migration/`(DBマイグレーション) | リードA(実行Rはリード B) | DBスキーマのA=リードA |
| `.github/workflows/` | 基盤チームリード+PMO(品質ゲート条件の変更時) | CI/CDのA=基盤チームリード |
| 上記以外(`frontend/` `backend/` `migration-tool/`) | 業務チームA/Bの各リード(担当領域別) | アプリコードのA=リードA/リードB |

- 基盤チームリード不在時の代行はリードA(KSM-ORG-001 §4-1 の代行順位)。CODEOWNERSにも代行者を併記する。
- IaC作業はペア実施(基盤メンバーへのナレッジ移転)。P4末までに基盤メンバー単独レビュー可能化を目標(KSM-ORG-001 §4-1)。

## 5. CI/CD との接続

- 変更パス検知(パスフィルタ)で領域別ジョブ(backend-quality / frontend-quality / iac-quality / security。KSM-DEV-001 §7)のみを起動し、モノレポのビルド時間増を抑制する(KSM-ADR-007 トレードオフ対応)。
- IaCの適用はCI/CDパイプライン経由のみ(`cdk diff` レビュー承認→デプロイ)。コンソール手作業変更は原則禁止(NFR-C01、KSM-ADR-006)。

## 6. 納品・トレーサビリティ

- 納品(RFP第6章「IaCコード一式」ほか)は検収版タグのスナップショットとして提供し、全成果物の版が単一タグで一意に特定できる。
- 要件ID(REQ/NFR)→PR→コード/IaCの追跡は、ブランチ・PR題名への要件ID記載規則とKSM-TRM-001により担保する(PMOが機械検査)。

以上
