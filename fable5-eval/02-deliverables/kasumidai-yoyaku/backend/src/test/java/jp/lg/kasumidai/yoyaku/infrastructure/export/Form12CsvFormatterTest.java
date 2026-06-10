package jp.lg.kasumidai.yoyaku.infrastructure.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.Charset;
import java.time.LocalDate;
import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.PaymentDailySummaryRow;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 財務会計連携CSVのテスト(REQ-020。会計課様式第12号=QA No.21確定様式の仕様証明)。
 * Shift_JIS・CRLF・ヘッダ行なし・日計集計形式・9項目。
 */
class Form12CsvFormatterTest {

  private static final Charset SJIS = Charset.forName("windows-31j");

  private final Form12CsvFormatter formatter = new Form12CsvFormatter();

  private final PaymentDailySummaryRow row =
      new PaymentDailySummaryRow(
          LocalDate.of(2026, 6, 10), 2026, "01", "14-01-02-01-01", "1", 12400L, 5,
          "市民体育館 6月分", "F001");

  @Test
  @DisplayName("9項目を様式順に出力(伝票日付YYYYMMDD・会計年度・会計区分・歳入科目・収納方法・金額・件数・摘要・施設コード)")
  void formatsNineFieldsInOrder() {
    String text = new String(formatter.format(List.of(row)), SJIS);
    assertThat(text)
        .isEqualTo("20260610,2026,01,14-01-02-01-01,1,12400,5,市民体育館 6月分,F001\r\n");
  }

  @Test
  @DisplayName("ヘッダ行なし・CRLF改行(様式第12号)")
  void noHeaderAndCrlf() {
    String text = new String(formatter.format(List.of(row, row)), SJIS);
    assertThat(text).doesNotContain("伝票日付");
    assertThat(text.split("\r\n")).hasSize(2);
    assertThat(text).endsWith("\r\n");
  }

  @Test
  @DisplayName("Shift_JISエンコード(日本語の摘要がSJISバイト列で出力される)")
  void encodesShiftJis() {
    byte[] bytes = formatter.format(List.of(row));
    // 「市」のShift_JISは 0x8E 0x73
    String text = new String(bytes, SJIS);
    assertThat(text).contains("市民体育館");
    assertThat(new String(bytes, java.nio.charset.StandardCharsets.UTF_8)).doesNotContain("市民体育館");
  }

  @Test
  @DisplayName("0件の場合は空コンテンツ")
  void emptyWhenNoRows() {
    assertThat(formatter.format(List.of())).isEmpty();
  }
}
