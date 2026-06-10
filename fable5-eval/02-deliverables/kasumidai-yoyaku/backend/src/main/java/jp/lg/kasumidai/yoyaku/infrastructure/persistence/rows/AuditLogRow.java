package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

/**
 * 操作ログ行(REQ-024:誰が・いつ・何を。audit_logs は追記専用=KSM-DDD-001 §3.4)。
 * 個人情報・秘匿情報は要約に含めない(KSM-DEV-002 S-92)。
 */
public record AuditLogRow(String actorType, long actorId, String action, String target, String summary) {}
