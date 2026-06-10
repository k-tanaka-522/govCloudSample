package jp.lg.kasumidai.yoyaku.infrastructure.export;

import java.nio.charset.Charset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.csv.SafeCsvWriter;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.PaymentDailySummaryRow;
import org.springframework.stereotype.Component;

/**
 * 財務会計連携CSVフォーマッタ(REQ-020。会計課様式第12号「歳入データ取込様式」=QA No.21確定)。
 *
 * <p>形式:CSV(Shift_JIS、CRLF、ヘッダ行なし、日計集計形式)。
 * 項目:(1)伝票日付 YYYYMMDD (2)会計年度 (3)会計区分コード (4)歳入科目コード(款・項・目・節・細節)
 * (5)収納方法コード (6)金額 (7)件数 (8)摘要(施設名・対象期間) (9)施設コード。
 * 様式変更時は本クラスのみ差し替え可能な構造とする(KSM-DDD-001 1.1版 §7.3)。
 */
@Component
public class Form12CsvFormatter {

  /** 市財務会計システムの取込文字コード(様式第12号指定)。windows-31j=Shift_JIS実装。 */
  private static final Charset OUTPUT_CHARSET = Charset.forName("windows-31j");

  private static final String CRLF = "\r\n";
  private static final DateTimeFormatter SLIP_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");

  /** 会計区分コード(一般会計)。様式第12号の定義による固定値。 */
  private static final String ACCOUNT_CLASS_GENERAL = "01";

  private final SafeCsvWriter csvWriter = new SafeCsvWriter();

  /** 日計集計行をShift_JIS・CRLF・ヘッダなしのバイト列に整形する。 */
  public byte[] format(List<PaymentDailySummaryRow> rows) {
    StringBuilder builder = new StringBuilder();
    for (PaymentDailySummaryRow row : rows) {
      builder.append(formatRow(row)).append(CRLF);
    }
    return builder.toString().getBytes(OUTPUT_CHARSET);
  }

  private String formatRow(PaymentDailySummaryRow row) {
    return csvWriter.formatLine(
        List.of(
            row.slipDate().format(SLIP_DATE),
            String.valueOf(row.fiscalYear()),
            ACCOUNT_CLASS_GENERAL,
            row.revenueCode(),
            row.methodCode(),
            String.valueOf(row.amountYen()),
            String.valueOf(row.count()),
            row.remarks(),
            row.facilityCode()));
  }
}
