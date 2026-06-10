package jp.lg.kasumidai.yoyaku.domain.finance;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.export.Form12CsvFormatter;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.AuditLogRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.PaymentRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.AuditLogRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.PaymentDailySummaryRow;
import org.springframework.stereotype.Service;

/**
 * 財務会計連携CSV生成(REQ-020。SC-S14からの手動生成・ダウンロード=自動連携なし)。
 * 様式は会計課様式第12号(QA No.21確定)。生成履歴を操作ログへ記録する(REQ-024)。
 */
@Service
public class FinanceExportService {

  /** 生成結果(ファイル名はRP-09の命名規則:歳入データ_期間.csv)。 */
  public record ExportResult(byte[] content, String filename, int lineCount) {}

  private static final DateTimeFormatter FILE_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");

  private final PaymentRepository paymentRepository;
  private final Form12CsvFormatter formatter;
  private final AuditLogRepository auditLogRepository;

  public FinanceExportService(
      PaymentRepository paymentRepository,
      Form12CsvFormatter formatter,
      AuditLogRepository auditLogRepository) {
    this.paymentRepository = paymentRepository;
    this.formatter = formatter;
    this.auditLogRepository = auditLogRepository;
  }

  public ExportResult export(LocalDate fromDate, LocalDate toDate, long staffId) {
    if (toDate.isBefore(fromDate)) {
      throw new IllegalArgumentException("期間指定が不正です");
    }
    List<PaymentDailySummaryRow> rows = paymentRepository.findDailySummaries(fromDate, toDate);
    byte[] content = formatter.format(rows);
    String filename =
        "sainyu_" + fromDate.format(FILE_DATE) + "-" + toDate.format(FILE_DATE) + ".csv";
    auditLogRepository.append(
        new AuditLogRow(
            "staff", staffId, "FINANCE_CSV_EXPORT", "rp-09:" + filename, "行数" + rows.size()));
    return new ExportResult(content, filename, rows.size());
  }
}
