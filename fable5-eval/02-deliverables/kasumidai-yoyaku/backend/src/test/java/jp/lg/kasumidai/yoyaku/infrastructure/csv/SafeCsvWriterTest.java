package jp.lg.kasumidai.yoyaku.infrastructure.csv;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** CSVインジェクション対策のテスト(KSM-DEV-002 S-55)。 */
class SafeCsvWriterTest {

  private final SafeCsvWriter writer = new SafeCsvWriter();

  @Test
  @DisplayName("先頭の = + - @ はシングルクォートで無害化")
  void escapesInjectionLeaders() {
    assertThat(writer.escapeField("=SUM(A1)")).isEqualTo("'=SUM(A1)");
    assertThat(writer.escapeField("+1234")).isEqualTo("'+1234");
    assertThat(writer.escapeField("-1234")).isEqualTo("'-1234");
    assertThat(writer.escapeField("@cmd")).isEqualTo("'@cmd");
  }

  @Test
  @DisplayName("カンマ・引用符・改行を含むフィールドはダブルクォートで囲む")
  void quotesSpecialCharacters() {
    assertThat(writer.escapeField("体育館,A面")).isEqualTo("\"体育館,A面\"");
    assertThat(writer.escapeField("引用\"符")).isEqualTo("\"引用\"\"符\"");
  }

  @Test
  @DisplayName("通常フィールドはそのまま・行はカンマ結合")
  void formatsPlainLine() {
    assertThat(writer.formatLine(List.of("20260610", "2026", "1200"))).isEqualTo("20260610,2026,1200");
  }
}
