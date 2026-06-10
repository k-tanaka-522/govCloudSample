package jp.lg.kasumidai.yoyaku.infrastructure.persistence;

import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.AuditLogRow;

/**
 * 操作ログの追記(audit_logs。追記専用=UPDATE/DELETE権限なし)。
 * 状態変更と同一トランザクションで記録し、失敗時は業務処理ごと失敗させる(KSM-DEV-002 S-91)。
 */
public interface AuditLogRepository {

  void append(AuditLogRow row);
}
