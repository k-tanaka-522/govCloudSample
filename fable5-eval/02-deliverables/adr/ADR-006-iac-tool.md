# KSM-ADR-006 IaCツール(P1方針の正式化)

| 項目 | 内容 |
|---|---|
| ステータス | 承認待ち(G2) |
| 日付 | 令和8年6月10日 |
| 起案 | リードA(アーキテクト)/基盤チームリード |
| 関連 | NFR-C01、steering/iac規約1(ADR記録義務)、KSM-TEC-001 §6(P1比較)、KSM-REP-001、リスク台帳R-04 |

## 背景

steering/iac規約は「IaCツールはAWS CDK(TypeScript)またはCloudFormation/Terraformとし、選定理由をADRに記録すること」と定める。P1の技術選定理由書(KSM-TEC-001 §6)で3案比較を実施しCDK(TypeScript)を方針決定済み。本ADRで正式決定する。

決定的な制約は体制与件:IaC経験者は全社で1名、インフラ基盤部は0.5人月/月のみ。IaCの作成・レビュー・保守をアプリケーション開発部(TypeScript経験者複数)が担える構造でなければ、IaC全面管理(NFR-C01)と5年間の保守が成立しない。

## 検討した選択肢

KSM-TEC-001 §6の比較マトリクスを正とする。要点:

- **A案 AWS CDK(TypeScript)**:8点。アプリ部のTSスキル直接転用、cdk-nag・assertionsテストによる品質ゲート、AWS公式ベストプラクティス整備[^1]。
- **B案 Terraform**:4点。最普及だがHCLの新規習熟が必要で経験者1名への依存が継続。マルチクラウド可搬性は本件(AWS固定与件)で無価値。
- **C案 CloudFormation直接記述**:4点。追加言語不要だが抽象化・再利用・テストの生産性で劣り少人数体制に不利。

## 決定

**AWS CDK(TypeScript)を正式採用**する。運用規律を次のとおり確定する。

1. **静的検査**:cdk-nag(AwsSolutionsルールパック+steering/iac規約のカスタムルール:命名`yoyaku-{env}-{role}`・必須タグ・SG/IAM/暗号化ベースライン)をCIで実行し、**エラー0を品質ゲート**とする(抑制は理由コメント+レビュー承認必須)。
2. **テスト**:CDK assertions+Jestでスナップショット/プロパティテストを整備(重要リソースの暗号化・タグ・削除保護)。
3. **環境差分**:環境別パラメータファイル(`infra/env/prod.ts` / `stg.ts` / `dev.ts`)で管理し、コード分岐禁止(steering/iac規約1)。IP許可リスト(NFR-E08)等の運用変更もパラメータで管理。
4. **適用経路**:CI/CDパイプライン経由のみ(`cdk diff`結果のレビュー承認→デプロイ)。コンソール手作業変更は原則禁止(NFR-C01)、緊急時の例外は事後24時間以内にIaC反映+記録。
5. **手作業範囲の宣言**(steering/iac規約1):GCAS利用申請・アカウント初期設定(市実施)、ドメインのDNS委任(市側DNS)、SES送信ドメイン検証の市側DNS登録、Cognito TOTPデバイスの個別登録。以上を除きすべてIaC管理。

## トレードオフ

- CDKはCloudFormationへの変換を介するため、スタック分割・更新時の挙動(リソース置換)の理解が必要 → ステートフルリソース(RDS・Cognito・S3)は独立スタックに分離し、削除保護・スナップショット保持をテストで強制。
- AWSロックイン → 固定与件1(ガバメントクラウドAWS)により制約事項とならない。NFR-D02(次期移行)はデータ・設計書の提供で担保し、IaCコード一式も納品物(RFP第6章)。

## 却下理由

- **Terraform**:習熟コストのみが残り、IaC経験者1名への依存構造(リスクR-04)を解消できない。ステート管理(S3+ロック)の追加運用も発生。
- **CloudFormation直接記述**:型検査・抽象化・単体テストがなく、レビュー負荷(数千行のYAML)が0.5人月/月のインフラ部レビュー体制で破綻する。

[^1]: AWS「Best practices for using the AWS CDK in TypeScript to create IaC projects」(AWS Prescriptive Guidance。cdk-nag・assertionsによる検査を含む公式ベストプラクティス)。https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-cdk-typescript-iac/introduction.html (参照日:令和8年6月10日)
