package jp.lg.kasumidai.yoyaku.infrastructure.csv;

import java.util.List;
import java.util.stream.Collectors;

/**
 * CSV共通出力部品(KSM-DEV-002 S-55:CSVインジェクション対策)。
 * 先頭が = + - @ のフィールドはシングルクォートを前置して無害化する。
 * 全CSV帳票(RP-03〜09)は本部品を経由して出力する(ArchUnitで強制予定)。
 */
public final class SafeCsvWriter {

  private static final String INJECTION_LEADERS = "=+-@";

  /** 1行をエスケープして結合する(区切り=カンマ)。 */
  public String formatLine(List<String> fields) {
    return fields.stream().map(this::escapeField).collect(Collectors.joining(","));
  }

  String escapeField(String field) {
    if (field == null || field.isEmpty()) {
      return "";
    }
    String value = field;
    if (INJECTION_LEADERS.indexOf(value.charAt(0)) >= 0) {
      value = "'" + value;
    }
    if (value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r")) {
      value = "\"" + value.replace("\"", "\"\"") + "\"";
    }
    return value;
  }
}
