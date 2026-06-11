# モジュールインデックス兼トレーサビリティ表(module-index)

霞台市公共施設予約管理システム構築及び運用保守業務(霞情政第126号)

| 項目 | 内容 |
|---|---|
| 文書番号 | KSM-MIX-001 |
| 版 | 1.0(初版) |
| 作成日 | 令和8年6月11日 |
| 作成者 | 受注者(当社)PMO(リードA/B・基盤チームリード確認) |
| 承認 | 発注者確認待ち(G4検収コメント対応・P5着手前) |
| 位置付け | **モジュールID(MOD-xxx)起点の正本**(steering/design-templates/20-detailed-design.md「モジュール粒度の原則」必須成果物。KSM-ADR-013決定3)。(a)ファイル管理一覧、(b)詳細設計・製造・単体テストの三工程トレーサビリティ、(c)検査官の過不足照合基準、の三役を兼ねる。要件ID起点の正本=KSM-TRM-001(併存。同期規則=KSM-DMP-001 1.2版 §8) |

## 運用ルール

1. パス略記:**DDD**=`05_ソフトウェア方式設計・詳細設計/12_詳細設計書/`、**BE**=`kasumidai-yoyaku/backend/src/main/java/jp/lg/kasumidai/yoyaku/`、**BT**=`kasumidai-yoyaku/backend/src/test/java/jp/lg/kasumidai/yoyaku/`、**FE**=`kasumidai-yoyaku/frontend/src/`、**IN**=`kasumidai-yoyaku/infra/`。詳細設計ファイルの `#MOD-xxx` は分冊内の節アンカー(見出しにモジュールIDを含む)。
2. 状態凡例:**テスト済**=実装+単体テスト通過/**実装済**=実装完了・UT未(P5)/**実装済(スタブ)**=骨格・IFありだが機能未完(コード内P4スタブ宣言)/**設計済**=設計のみ(P5/P6実装)。正直申告を原則とする。
3. **同期規則(完了条件)**:本表記載ファイルの全実在(順方向)と、対象範囲実ファイルの全登録(逆方向)を、ファイル増減を伴うPRの完了条件として機械照合する(KSM-ADR-013トレードオフ対応)。照合対象範囲=`kasumidai-yoyaku/` 配下の実ファイル(node_modules/・cdk.out/・package-lock.json を除く)。モジュールに属さない実ファイル(ビルド・規約設定等)は附表Bに登録し、納品文書(*.md)はKSM-DMP-001、dev-standards/はKSM-DEV-001 §8 を正本とする。
4. 採番:MOD-0xx=バックエンド/MOD-1xx=フロントエンド/MOD-2xx=IaC/MOD-3xx=P5・P6実装予定。番号恒久・欠番許容(KSM-ADR-013)。

## モジュール一覧

### バックエンド(MOD-0xx)

| モジュールID | 名称 | 関連REQ-ID | 詳細設計ファイル | 製造ファイル | 単体テストファイル | 状態 | 備考 |
|---|---|---|---|---|---|---|---|
| MOD-001 | 空き状況照会 | REQ-006 | DDD12-01_予約編.md#MOD-001 | BE application/availability/GetAvailabilityUseCase.java、domain/availability/AvailabilityQueryService.java、domain/availability/AvailabilitySlot.java、presentation/api/publicapi/AvailabilityController.java、infrastructure/persistence/AvailabilityRepository.java、infrastructure/persistence/jdbc/JdbcAvailabilityRepository.java、infrastructure/persistence/rows/AvailabilitySlotRow.java | −(JDBC結合依存。P5 ITで検証) | 実装済 | キャッシュ60秒=ADR-009 |
| MOD-002 | 先着予約申込 | REQ-007, 010 | DDD12-01_予約編.md#MOD-002 | BE application/reservation/ReserveFacilityUseCase.java、domain/reservation/ReservationDomainService.java、domain/reservation/SlotRequest.java、domain/reservation/SlotConflict.java、domain/reservation/SlotConflictException.java、domain/reservation/ConflictReason.java、domain/reservation/ReservationStatus.java、presentation/api/user/ReservationController.java、presentation/api/user/ReservationRequestDto.java、presentation/api/user/ReservationResponseDto.java、infrastructure/persistence/ReservationRepository.java、infrastructure/persistence/jdbc/JdbcReservationRepository.java、infrastructure/persistence/rows/ReservationRow.java、infrastructure/persistence/rows/NewReservationRow.java、infrastructure/persistence/rows/SlotKeyRow.java、infrastructure/persistence/UserRepository.java、infrastructure/persistence/jdbc/JdbcUserRepository.java | −(ドメインサービスはJDBC結合依存。P5 IT) | 実装済 | ReservationControllerの取消APIはMOD-005。UserRepositoryはMOD-009と共用。認証はスタブS-1(MOD-302) |
| MOD-003 | 予約上限判定 | REQ-002, 009 | DDD12-01_予約編.md#MOD-003 | BE domain/reservation/ReservationLimitPolicy.java、domain/reservation/ReservationLimitRule.java、domain/reservation/LimitViolation.java、infrastructure/persistence/LimitRuleRepository.java、infrastructure/persistence/jdbc/JdbcLimitRuleRepository.java、infrastructure/persistence/rows/LimitRuleRow.java | BT domain/reservation/ReservationLimitPolicyTest.java | テスト済 | L-1〜L-4初期値=V2シード(QA No.10) |
| MOD-004 | 一括予約整合 | REQ-010 | DDD12-01_予約編.md#MOD-004 | BE domain/reservation/BulkReservationValidator.java | BT domain/reservation/BulkReservationValidatorTest.java | テスト済 | 全件成立/全件不成立 |
| MOD-005 | 予約取消・キャンセル料 | REQ-011, 019 | DDD12-01_予約編.md#MOD-005 | BE application/reservation/CancelReservationUseCase.java、domain/reservation/CancellationService.java、domain/fee/CancellationPolicy.java、infrastructure/persistence/rows/CancellationPolicyRow.java | BT domain/fee/CancellationPolicyTest.java | テスト済 | スタブS-4:明細別取消期限はP5(現状=予約内最先利用日) |
| MOD-006 | 料金算定 | REQ-015 | DDD12-02_料金・減免・還付編.md#MOD-006 | BE domain/fee/FeeCalculator.java、domain/fee/FeeResolver.java、domain/fee/FeeCalculation.java、domain/fee/FeeBreakdownItem.java、domain/fee/FeeTableEntry.java、infrastructure/persistence/FeeMasterRepository.java、infrastructure/persistence/jdbc/JdbcFeeMasterRepository.java、infrastructure/persistence/rows/FeeEntryRow.java | BT domain/fee/FeeCalculatorTest.java、domain/fee/FeeResolverTest.java | テスト済 | 適用基準日=申込日(QA No.12) |
| MOD-007 | 減免算定 | REQ-018 | DDD12-02_料金・減免・還付編.md#MOD-007 | BE domain/exemption/ExemptionCalculator.java、domain/exemption/ExemptionCategory.java | BT domain/exemption/ExemptionCalculatorTest.java | テスト済 | WF画面=MOD-304 |
| MOD-008 | 還付算定 | REQ-019 | DDD12-02_料金・減免・還付編.md#MOD-008 | BE domain/refund/RefundCalculator.java | BT domain/refund/RefundCalculatorTest.java | テスト済 | 管理画面=MOD-305 |
| MOD-009 | 抽選 | REQ-008 | DDD12-03_抽選編.md#MOD-009 | BE domain/lottery/LotteryDrawService.java、domain/lottery/LotteryEntry.java、domain/lottery/LotteryExecutionService.java、domain/lottery/LotteryPreference.java、domain/lottery/LotteryResult.java、domain/lottery/SlotAvailability.java、domain/lottery/WinLimitChecker.java、application/lottery/ExecuteLotteryUseCase.java、presentation/api/staff/LotteryAdminController.java、infrastructure/persistence/LotteryRepository.java、infrastructure/persistence/jdbc/JdbcLotteryRepository.java、infrastructure/persistence/rows/LotteryEntryRow.java、infrastructure/persistence/rows/LotteryResultRow.java、infrastructure/persistence/FacilityRepository.java、infrastructure/persistence/jdbc/JdbcFacilityRepository.java | BT domain/lottery/LotteryDrawServiceTest.java | テスト済 | 抽選申込API・繰上げ=P5(openapi designed)。繰上げ=職員操作(QA No.15) |
| MOD-010 | 仮押さえ期限管理 | REQ-021 | DDD12-01_予約編.md#MOD-010 | BE domain/hold/HoldExpiryPolicy.java、domain/hold/HoldReleaseService.java、application/hold/ReleaseExpiredHoldsUseCase.java | BT domain/hold/HoldExpiryPolicyTest.java | テスト済 | 窓口登録画面=MOD-310。JB-02 |
| MOD-011 | 財務会計CSV出力 | REQ-020, 025 | DDD12-04_収納・決済・財務編.md#MOD-011 | BE domain/finance/FinanceExportService.java、application/finance/ExportFinanceCsvUseCase.java、presentation/api/staff/FinanceExportController.java、infrastructure/export/Form12CsvFormatter.java、infrastructure/csv/SafeCsvWriter.java、infrastructure/persistence/PaymentRepository.java、infrastructure/persistence/jdbc/JdbcPaymentRepository.java、infrastructure/persistence/rows/PaymentDailySummaryRow.java | BT infrastructure/export/Form12CsvFormatterTest.java、infrastructure/csv/SafeCsvWriterTest.java | テスト済 | 様式第12号(QA No.21)。P5で会計課テスト取込 |
| MOD-012 | メール通知投入 | REQ-012 | DDD12-05_通知・バッチ編.md#MOD-012 | BE infrastructure/notification/NotificationQueue.java、infrastructure/notification/SqsNotificationQueue.java | −(SQS結合依存。P5 IT) | 実装済 | 送信ワーカーWK-01=MOD-308(未実装) |
| MOD-013 | 決済代行連携 | REQ-016 | DDD12-04_収納・決済・財務編.md#MOD-013 | BE infrastructure/payment/PaymentGateway.java、infrastructure/payment/mirai/MiraiPaymentGatewayAdapter.java | −(P5:接続仕様書受領後にIT) | 実装済(スタブ) | S-2:createCheckout未実装。署名検証は実装済み。D-1訂正(インフラ層配置)反映済み |
| MOD-014 | バッチ実行基盤 | REQ-008, 021(JB横断) | DDD12-00_総説・共通編.md#MOD-014 | BE batch/BatchJobRunner.java | −(P5 IT:JB再実行試験) | 実装済 | ApplicationRunner+batch_job_locks=ADR-012 |
| MOD-015 | 操作ログ記録 | REQ-024 | DDD12-00_総説・共通編.md#MOD-015 | BE infrastructure/persistence/AuditLogRepository.java、infrastructure/persistence/jdbc/JdbcAuditLogRepository.java、infrastructure/persistence/rows/AuditLogRow.java | −(P5 IT) | 実装済 | 追記専用。検索画面=MOD-311 |
| MOD-016 | 共通エラー処理 | REQ-014(エラー特定)、NFR-E04 | DDD12-00_総説・共通編.md#MOD-016 | BE presentation/error/GlobalExceptionHandler.java、domain/common/DomainException.java | −(各モジュールUTで間接検証) | 実装済 | RFC 9457統一 |
| MOD-017 | アプリ起動・設定 | REQ-027、NFR-E01 | DDD12-00_総説・共通編.md#MOD-017 | BE YoyakuApplication.java、`kasumidai-yoyaku/backend/src/main/resources/application.yml` | −(起動確認=P5 IT) | 実装済 | 秘匿情報=環境変数注入 |
| MOD-018 | DBスキーマ・マイグレーション | REQ-005, 009, 015, 024, 027、NFR-D02 | DDD12-00_総説・共通編.md#MOD-018 | `kasumidai-yoyaku/backend/src/main/resources/db/migration/V1__init.sql`、`kasumidai-yoyaku/backend/src/main/resources/db/migration/V2__seed_business_rules.sql` | −(Flyway適用検証=CI/P5) | 実装済 | P5追加分はV3〜(12-08 §6) |

### フロントエンド(MOD-1xx)

| モジュールID | 名称 | 関連REQ-ID | 詳細設計ファイル | 製造ファイル | 単体テストファイル | 状態 | 備考 |
|---|---|---|---|---|---|---|---|
| MOD-101 | 空き状況カレンダー画面(SC-U03) | REQ-006, 013, 014 | DDD12-06_フロントエンド編.md#MOD-101 | FE ui/pages/AvailabilityCalendarPage.tsx、application/availabilityService.ts、domain/gateways/availabilityGateway.ts、infrastructure/availabilityApi.ts | −(P5:Testing Library+AX試験) | 実装済 | AA対応マークアップ実装済み |
| MOD-102 | 予約申込ウィザード画面(SC-U08) | REQ-007, 010 | DDD12-06_フロントエンド編.md#MOD-102 | FE ui/pages/ReservationWizardPage.tsx、application/reservationService.ts、domain/gateways/reservationGateway.ts、infrastructure/reservationApi.ts | −(P5) | 実装済 | プレチェック=MOD-105 |
| MOD-103 | マイページ・予約取消画面(SC-U07/U10) | REQ-004, 011 | DDD12-06_フロントエンド編.md#MOD-103 | FE ui/pages/MyReservationsPage.tsx | −(P5) | 実装済 | 一覧APIはP5結線 |
| MOD-104 | 職員抽選管理画面(SC-S09) | REQ-008、NFR-C06 | DDD12-06_フロントエンド編.md#MOD-104 | FE ui/pages/staff/StaffLotteryPage.tsx、application/lotteryAdminService.ts、domain/gateways/lotteryAdminGateway.ts、infrastructure/lotteryAdminApi.ts | −(P5。S-5:E2E未検証) | 実装済 | 1業務1画面・ガイダンス常設 |
| MOD-105 | フロントエンド業務ルール | REQ-010, 011, 015, 018 | DDD12-06_フロントエンド編.md#MOD-105 | FE domain/fee.ts、domain/cancellation.ts、domain/limits.ts、domain/constants.ts、domain/types.ts | FE domain/fee.test.ts、domain/cancellation.test.ts、domain/limits.test.ts(Vitest 14件通過) | テスト済 | 表示用プレチェック(判定の正はサーバ)。定数=KSM-BRL-001 1.1版と同期 |
| MOD-106 | フロントエンド共通基盤 | REQ-013、NFR-F01/F02 | DDD12-06_フロントエンド編.md#MOD-106 | FE main.tsx、ui/App.tsx、infrastructure/httpClient.ts、`kasumidai-yoyaku/frontend/index.html` | −(P5) | 実装済 | レスポンシブCSS本格実装=P5 |

### IaC(MOD-2xx)

| モジュールID | 名称 | 関連REQ-ID | 詳細設計ファイル | 製造ファイル | 単体テストファイル | 状態 | 備考 |
|---|---|---|---|---|---|---|---|
| MOD-201 | NetworkStack | NFR-A02 | DDD12-07_IaC・監視編.md#MOD-201 | IN lib/network-stack.ts | IN test/stacks.test.ts | テスト済 | VPC/SG/FlowLogs |
| MOD-202 | StatefulStack | REQ-005、NFR-A02〜A04, E01, E02, F02 | DDD12-07_IaC・監視編.md#MOD-202 | IN lib/stateful-stack.ts | IN test/stacks.test.ts | テスト済 | KMS×2/RDS/Cognito×2/S3×2 |
| MOD-203 | AppStack | REQ-008, 012、NFR-A01, B01, B03, E06 | DDD12-07_IaC・監視編.md#MOD-203 | IN lib/app-stack.ts | IN test/stacks.test.ts | テスト済 | ECS/SQS/ALB/Scheduler×4+暖機 |
| MOD-204 | DeliveryStack | REQ-006、NFR-E05, E08 | DDD12-07_IaC・監視編.md#MOD-204 | IN lib/delivery-stack.ts | −(us-east-1のためAssertions対象外=手動確認。P5でテスト追加検討) | 実装済 | CloudFront/WAF(IP制限14拠点)/S3-SPA。cdk-nag 0 violations |
| MOD-205 | MonitoringStack | NFR-C02 | DDD12-07_IaC・監視編.md#MOD-205 | IN lib/monitoring-stack.ts | IN test/stacks.test.ts | テスト済 | Alarm×13/Dashboard/SNS |
| MOD-206 | 環境パラメータ・エントリポイント | NFR-C01, E08 | DDD12-07_IaC・監視編.md#MOD-206 | IN env/types.ts、env/prod.ts、env/stg.ts、bin/app.ts、lib/common/tags.ts | IN test/stacks.test.ts(validateParams間接検証) | テスト済 | 14拠点IP確定値(QA No.17)・prod空値エラー |
| MOD-207 | PipelineStack(CI実行基盤) | NFR-C01 | DDD12-07_IaC・監視編.md#MOD-207 | IN lib/pipeline-stack.ts、`kasumidai-yoyaku/buildspec.yml`(CodeBuild品質ゲート定義)、`kasumidai-yoyaku/backend/Dockerfile`(マルチステージビルド・非root実行) | −(**未作成。P5冒頭で test/stacks.test.ts へ追加**) | 実装済 | ECR-CI/CodeBuild。CodeCommit新規停止の代替判断をコード内記録。KSM-ENV-001(P5納品)で詳述 |

### P5・P6実装予定(MOD-3xx。設計済み骨格)

| モジュールID | 名称 | 関連REQ-ID | 詳細設計ファイル | 製造ファイル | 単体テストファイル | 状態 | 備考 |
|---|---|---|---|---|---|---|---|
| MOD-301 | 利用者登録・本人確認 | REQ-001, 004 | DDD12-08_職員管理・運用機能編.md#MOD-301 | −(P5) | −(P5) | 設計済 | users/registration_statusはV1実装済み |
| MOD-302 | 認証BFF・認可インターセプタ | REQ-003, 023、NFR-E02 | DDD12-08_職員管理・運用機能編.md#MOD-302 | −(P5。暫定ヘッダのみ=スタブS-1) | −(P5:権限マトリクス試験) | 実装済(スタブ) | Cognito設定(IaC)はMOD-202実装済み。staff_facility_rolesテーブル=V3 |
| MOD-303 | 窓口収納・納付書発行 | REQ-017 | DDD12-04_収納・決済・財務編.md#MOD-303 | −(P5) | −(P5) | 設計済 | paymentsテーブルはV1実装済み。GS1-128桁割=接続仕様書受領後 |
| MOD-304 | 減免申請・承認WF | REQ-018 | DDD12-08_職員管理・運用機能編.md#MOD-304 | −(P5) | −(P5) | 設計済 | 計算エンジン=MOD-007実装済み |
| MOD-305 | 還付管理画面 | REQ-019 | DDD12-04_収納・決済・財務編.md#MOD-305 | −(P5) | −(P5) | 設計済 | 算定=MOD-008実装済み |
| MOD-306 | 統計・月次集計(JB-04) | REQ-025 | DDD12-08_職員管理・運用機能編.md#MOD-306 | −(P5) | −(P5) | 設計済 | 日計クエリはMOD-011実装済み |
| MOD-307 | お知らせ管理 | REQ-026 | DDD12-08_職員管理・運用機能編.md#MOD-307 | −(P5) | −(P5) | 設計済 | noticesテーブル=V3 |
| MOD-308 | 通知・消込ワーカー(WK-01/02) | REQ-012, 016 | DDD12-05_通知・バッチ編.md#MOD-308 | −(P5) | −(P5) | 設計済 | 投入側=MOD-012実装済み |
| MOD-309 | 帳票PDF生成(RP-01〜07) | REQ-017, 018, 019, 025 | DDD12-04_収納・決済・財務編.md#MOD-309 | −(P5) | −(P5) | 設計済 | JasperReports=ADR-011。様式モック業務部会確認中 |
| MOD-310 | マスタ保守・供用管理・窓口画面 | REQ-015, 021, 022 | DDD12-08_職員管理・運用機能編.md#MOD-310 | −(P5) | −(P5) | 設計済 | closures判定ロジックはMOD-002実装済み |
| MOD-311 | 操作ログ検索画面 | REQ-024 | DDD12-08_職員管理・運用機能編.md#MOD-311 | −(P5) | −(P5) | 設計済 | 記録側=MOD-015実装済み |
| MOD-312 | 移行ツール | REQ-027, 028、NFR-D01 | DDD12-09_移行・マスキング編.md#MOD-312 | −(P6。`kasumidai-yoyaku/migration-tool/` はディレクトリ骨格のみ=S-4) | −(P6:移行リハーサル) | 設計済 | legacy_id列はV1実装済み |
| MOD-313 | テストデータマスキング | NFR-E09 | DDD12-09_移行・マスキング編.md#MOD-313 | −(P5前半) | −(P5前半:漏れ検査) | 設計済 | 規則確定済み(12-09 §2) |

## 集計(状態内訳)

| 状態 | バックエンド | フロントエンド | IaC | P5/P6予定 | 計 |
|---|---|---|---|---|---|
| テスト済 | 9(MOD-003〜011) | 1(MOD-105) | 5(MOD-201〜203, 205, 206) | − | **15** |
| 実装済(UT=P5) | 8(MOD-001, 002, 012, 014〜018) | 5(MOD-101〜104, 106) | 2(MOD-204, 207) | − | **15** |
| 実装済(スタブ) | 1(MOD-013=S-2) | − | − | 1(MOD-302=S-1) | **2** |
| 設計済(未実装) | − | − | − | 12(MOD-301, 303〜313) | **12** |
| **計** | **18** | **6** | **7** | **13** | **44** |

(KSM-TRM-001 1.4版の要件別集計〔実装追跡可12・スタブ10・未実装32=要件単位〕とは集計軸が異なる。要件→モジュールの対応は各行の関連REQ-ID列で突合可能)

## 附表A 詳細設計分冊・設計正本の実在一覧

| ファイル | 文書番号 |
|---|---|
| DDD 12-00_総説・共通編.md 〜 12-09_移行・マスキング編.md(10分冊) | KSM-DDD-001-00〜09 |
| `kasumidai-yoyaku/docs/openapi.yaml` | KSM-API-001(外部IF正本) |
| 本ファイル(02-deliverables/module-index.md) | KSM-MIX-001 |

## 附表B モジュール外の実ファイル(ビルド・規約・CI設定。逆方向照合の対象)

| ファイル(kasumidai-yoyaku/からの相対) | 区分 | 管理正本 |
|---|---|---|
| backend/pom.xml | ビルド定義(Java) | KSM-DEV-001 §7 |
| standards/checkstyle.xml | 規約設定(pom参照実体) | KSM-DEV-001 §8(dev-standards版と同一内容) |
| backend/src/test/java/jp/lg/kasumidai/yoyaku/architecture/LayeredArchitectureTest.java | 横断品質検査(ArchUnit。全モジュール対象) | KSM-DEV-001 §2/§8 |
| .github/workflows/ci-quality-gate.yml | CI定義 | KSM-DEV-001 §7 |
| frontend/package.json、frontend/tsconfig.json | ビルド定義(TS) | KSM-DEV-001 §5.2 |
| frontend/eslint.config.mjs、frontend/dependency-cruiser.cjs | 規約設定(frontend配置実体) | KSM-DEV-001 §8 |
| infra/package.json、infra/tsconfig.json、infra/jest.config.cjs、infra/cdk.json、infra/cdk.context.json、infra/.gitignore | IaCビルド・CDK設定 | KSM-DEV-001 §5.2/KSM-ADR-006 |

(範囲外:node_modules/・cdk.out/・package-lock.json〔機械生成物〕、02-deliverables直下の納品文書*.md〔KSM-DMP-001〕、dev-standards/〔KSM-DEV-001 §8〕、kasumidai-yoyaku/docs/・migration-tool/の空ディレクトリ)

## 同期確認記録

| 日付 | 確認内容 | 結果 |
|---|---|---|
| 令和8年6月11日 | 順方向:本表記載の全ファイルパス(詳細設計分冊10・製造・テスト・附表A/B。パストークン151件)の実在を機械照合 | **全件実在(欠落0件)** |
| 令和8年6月11日 | 逆方向:`kasumidai-yoyaku/` 配下の実ファイル151件(除外規則適用後)が本表(モジュール行+附表A/B)に全登録されているかを機械照合 | **全件登録(漏れ0件)**。照合過程でCI付帯実体2件(buildspec.yml・backend/Dockerfile)の登録漏れを検出しMOD-207へ登録(本表の存在意義どおりズレを検出・解消) |
| 令和8年6月11日 | 粒度整合:詳細設計・製造・単体テストのいずれかを欠くモジュールの検出 | UT未作成=MOD-001/002/012/014〜018/101〜104/106/204/207(状態列に明示・P5計画あり)。設計済(未実装)=MOD-301〜313(計画どおり)。**未計画の欠落=0件** |

以上
