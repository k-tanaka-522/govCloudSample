package jp.lg.kasumidai.yoyaku.infrastructure.persistence.jdbc;

import jp.lg.kasumidai.yoyaku.infrastructure.persistence.AuditLogRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.AuditLogRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 操作ログのJDBC実装(追記専用。状態変更と同一トランザクション=KSM-DEV-002 S-91)。 */
@Repository
public class JdbcAuditLogRepository implements AuditLogRepository {

  private final JdbcTemplate jdbc;

  public JdbcAuditLogRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public void append(AuditLogRow row) {
    jdbc.update(
        "INSERT INTO audit_logs (actor_type, actor_id, action, target, summary, acted_at) "
            + "VALUES (?, ?, ?, ?, ?, now())",
        row.actorType(),
        row.actorId(),
        row.action(),
        row.target(),
        row.summary());
  }
}
