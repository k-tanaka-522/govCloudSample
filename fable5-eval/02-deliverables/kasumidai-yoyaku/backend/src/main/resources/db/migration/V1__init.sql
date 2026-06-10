-- =============================================================================
-- V1: 初期スキーマ(KSM-DDD-001 §3 DB物理設計)
-- 物理名=snake_case英語、論理名(日本語)はKSM-DDD-001 §3.3で対管理
-- 主キーは bigint GENERATED ALWAYS AS IDENTITY(KSM-DDD-001 §3.1)
-- 監査列(created_at/created_by/updated_at/updated_by)を全業務テーブルに必須
-- =============================================================================

-- 利用者区分(REQ-002)
CREATE TABLE user_categories (
  user_category_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_code varchar(20) NOT NULL UNIQUE,
  category_name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);

-- 利用者(REQ-001/002/005)
CREATE TABLE users (
  user_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cognito_sub varchar(64) UNIQUE,
  user_category_id bigint NOT NULL REFERENCES user_categories,
  display_name varchar(200) NOT NULL,
  email varchar(254) NOT NULL,
  registration_status varchar(20) NOT NULL DEFAULT 'provisional'
    CHECK (registration_status IN ('provisional','registered','suspended')),
  legacy_id varchar(50),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);

-- 施設(REQ-006/022)
CREATE TABLE facilities (
  facility_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_code varchar(10) NOT NULL UNIQUE,
  facility_name varchar(200) NOT NULL,
  facility_type varchar(20) NOT NULL,
  fiscal_year int NOT NULL DEFAULT 2026,
  account_code varchar(10) NOT NULL DEFAULT '01',
  revenue_code varchar(20) NOT NULL DEFAULT '00-00-00-00-00',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);

-- コマパターン・コマ(REQ-006/015)
CREATE TABLE slot_patterns (
  slot_pattern_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pattern_name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);

CREATE TABLE slots (
  slot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot_pattern_id bigint NOT NULL REFERENCES slot_patterns,
  slot_name varchar(50) NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);

-- 面・室(REQ-006)
CREATE TABLE units (
  unit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_id bigint NOT NULL REFERENCES facilities,
  slot_pattern_id bigint NOT NULL REFERENCES slot_patterns,
  unit_name varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);

-- 料金マスタ(REQ-015。適用開始日付き版管理。適用基準日=申込日:QA No.12)
CREATE TABLE fee_master (
  fee_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id bigint NOT NULL REFERENCES units,
  slot_id bigint NOT NULL REFERENCES slots,
  user_category_id bigint NOT NULL REFERENCES user_categories,
  valid_from date NOT NULL,
  amount numeric(10,0) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system',
  UNIQUE (unit_id, slot_id, user_category_id, valid_from)
);
CREATE INDEX ix_fee_master_resolve ON fee_master (unit_id, slot_id, user_category_id, valid_from DESC);

-- 付帯設備・設備料金(REQ-015)
CREATE TABLE equipment (
  equipment_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_id bigint NOT NULL REFERENCES facilities,
  equipment_name varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);

CREATE TABLE equipment_fees (
  equipment_fee_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  equipment_id bigint NOT NULL REFERENCES equipment,
  slot_id bigint NOT NULL REFERENCES slots,
  amount numeric(10,0) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system',
  UNIQUE (equipment_id, slot_id)
);

-- 予約上限ルール(REQ-009。KSM-BRL-001 §1.1 L-1〜L-4。初期値=QA No.10確定)
CREATE TABLE reservation_limit_rules (
  limit_rule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_id bigint NOT NULL REFERENCES facilities,
  user_category_id bigint NOT NULL REFERENCES user_categories,
  monthly_max_slots int NOT NULL,
  same_day_max_slots int NOT NULL,
  max_open_reservations int NOT NULL,
  accept_start_months_before int NOT NULL,
  accept_start_hour int NOT NULL,
  valid_from date NOT NULL DEFAULT '2026-04-01',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system',
  UNIQUE (facility_id, user_category_id, valid_from)
);

-- 取消規則(REQ-011。初期値=QA No.11確定:7日前まで無料/6日前以降100%)
CREATE TABLE cancellation_rules (
  cancellation_rule_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_id bigint NOT NULL REFERENCES facilities,
  free_cancel_days_before int NOT NULL,
  charge_rate_percent int NOT NULL CHECK (charge_rate_percent BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system',
  UNIQUE (facility_id)
);

-- 休館・優先利用枠(REQ-022)
CREATE TABLE closures (
  closure_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id bigint NOT NULL REFERENCES units,
  closure_type varchar(20) NOT NULL CHECK (closure_type IN ('closed','maintenance','priority')),
  date_from date NOT NULL,
  date_to date NOT NULL,
  reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);
CREATE INDEX ix_closures_unit_range ON closures (unit_id, date_from, date_to);

-- 予約(REQ-007〜011/021)
CREATE TABLE reservations (
  reservation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users,
  purpose varchar(200) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('hold','pending','confirmed','cancelled','expired')),
  due_at timestamptz,
  base_amount numeric(10,0) NOT NULL DEFAULT 0,
  equipment_amount numeric(10,0) NOT NULL DEFAULT 0,
  exemption_amount numeric(10,0) NOT NULL DEFAULT 0,
  billed_amount numeric(10,0) NOT NULL DEFAULT 0,
  calculation_detail jsonb NOT NULL DEFAULT '[]'::jsonb,
  legacy_id varchar(50),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);
CREATE INDEX ix_reservations_user ON reservations (user_id, created_at DESC);
CREATE INDEX ix_reservations_due ON reservations (status, due_at) WHERE status = 'pending';

-- 予約明細(コマ。二重予約のDBレベル防止=KSM-DDD-001 §3.4)
CREATE TABLE reservation_details (
  reservation_detail_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id bigint NOT NULL REFERENCES reservations,
  unit_id bigint NOT NULL REFERENCES units,
  use_date date NOT NULL,
  slot_id bigint NOT NULL REFERENCES slots,
  status varchar(20) NOT NULL CHECK (status IN ('hold','pending','confirmed','cancelled','expired')),
  amount numeric(10,0) NOT NULL
);
-- 有効状態の明細のみを対象とする部分一意インデックス(KSM-ADR-009決定3)
CREATE UNIQUE INDEX uq_active_slot ON reservation_details (unit_id, use_date, slot_id)
  WHERE status IN ('hold','pending','confirmed');
CREATE INDEX ix_reservation_details_reservation ON reservation_details (reservation_id);

-- 請求(REQ-015/018)
CREATE TABLE billings (
  billing_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id bigint NOT NULL REFERENCES reservations,
  base_amount numeric(10,0) NOT NULL,
  equipment_amount numeric(10,0) NOT NULL DEFAULT 0,
  exemption_amount numeric(10,0) NOT NULL DEFAULT 0,
  billed_amount numeric(10,0) NOT NULL,
  calculation_detail jsonb NOT NULL,
  due_at timestamptz,
  status varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);

-- 収納(REQ-016/017)
CREATE TABLE payments (
  payment_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  billing_id bigint NOT NULL REFERENCES billings,
  method_code varchar(10) NOT NULL,  -- 収納方法コード(様式第12号:窓口現金/コンビニ/オンライン決済)
  amount numeric(10,0) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('requested','settled','failed','refunding','refunded')),
  gateway_transaction_id varchar(100),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);
CREATE INDEX ix_payments_billing ON payments (billing_id);
CREATE INDEX ix_payments_paid_at ON payments (paid_at);
CREATE UNIQUE INDEX uq_payments_gateway_tx ON payments (gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;

-- 抽選期間・申込・希望明細(REQ-008)
CREATE TABLE lottery_periods (
  lottery_period_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_month date NOT NULL,
  facility_group varchar(50) NOT NULL,
  entry_from timestamptz NOT NULL,
  entry_to timestamptz NOT NULL,
  draw_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system'
);

CREATE TABLE lottery_entries (
  lottery_entry_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lottery_period_id bigint NOT NULL REFERENCES lottery_periods,
  user_id bigint NOT NULL REFERENCES users,
  status varchar(20) NOT NULL DEFAULT 'entered'
    CHECK (status IN ('entered','withdrawn','won','lost','promoted')),
  random_key bigint,
  won_rank int,
  losing_order int,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by varchar(50) NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by varchar(50) NOT NULL DEFAULT 'system',
  UNIQUE (lottery_period_id, user_id)  -- 重複申込防止(KSM-BRL-001 §5.2-2)
);
CREATE INDEX ix_lottery_entries_draw ON lottery_entries (lottery_period_id, random_key);

CREATE TABLE lottery_entry_details (
  lottery_entry_detail_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lottery_entry_id bigint NOT NULL REFERENCES lottery_entries,
  pref_rank int NOT NULL CHECK (pref_rank BETWEEN 1 AND 3),
  unit_id bigint NOT NULL REFERENCES units,
  use_date date NOT NULL,
  slot_id bigint NOT NULL REFERENCES slots
);

-- 操作ログ(REQ-024/NFR-E06。追記専用:アプリロールにUPDATE/DELETE権限を付与しない)
-- 月次パーティション・S3退避はJB-05(P4後半)で追加
CREATE TABLE audit_logs (
  audit_log_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type varchar(10) NOT NULL CHECK (actor_type IN ('user','staff','system')),
  actor_id bigint NOT NULL,
  action varchar(50) NOT NULL,
  target varchar(200) NOT NULL,
  summary varchar(1000),
  acted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_logs_acted ON audit_logs (acted_at);
CREATE INDEX ix_audit_logs_actor ON audit_logs (actor_type, actor_id, acted_at);

-- バッチ多重起動制御(KSM-ADR-008の冪等設計)
CREATE TABLE batch_job_locks (
  job_name varchar(50) NOT NULL,
  target_key varchar(100) NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_name, target_key)
);

-- 通知履歴(REQ-012。二重送信防止の処理済み判定)
CREATE TABLE notification_logs (
  notification_log_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id varchar(100) NOT NULL UNIQUE,
  notification_type varchar(50) NOT NULL,
  target_id bigint NOT NULL,
  send_status varchar(20) NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
