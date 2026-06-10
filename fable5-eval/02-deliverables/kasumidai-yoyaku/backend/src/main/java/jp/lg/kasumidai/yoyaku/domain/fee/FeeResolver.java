package jp.lg.kasumidai.yoyaku.domain.fee;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import jp.lg.kasumidai.yoyaku.domain.common.DomainException;

/**
 * 料金表の版解決(KSM-BRL-001 1.1版 §3.1。QA No.12回答反映)。
 *
 * <p>適用基準日は「申込(使用許可)日」とする(利用日時点適用ではない)。
 * fee_master の「申込日時点で有効な版」(validFrom &lt;= 申込日 &lt; 次版validFrom)を適用する。
 * 条例改定時は附則の経過措置(施行日前に許可済みの利用には旧料金)と整合する。
 */
public final class FeeResolver {

  /**
   * 申込日時点で有効な料金版を解決する。
   *
   * @param entries 同一(施設×コマ×利用者区分×設備)の料金版一覧
   * @param applicationDate 申込(使用許可)日 ※利用日ではない(QA No.12)
   */
  public FeeTableEntry resolve(List<FeeTableEntry> entries, LocalDate applicationDate) {
    return entries.stream()
        .filter(e -> !e.validFrom().isAfter(applicationDate))
        .max(Comparator.comparing(FeeTableEntry::validFrom))
        .orElseThrow(
            () ->
                new DomainException(
                    "fee-not-found", "申込日時点で有効な料金表が存在しません: " + applicationDate));
  }
}
