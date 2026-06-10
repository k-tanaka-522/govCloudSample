package jp.lg.kasumidai.yoyaku.infrastructure.persistence;

import java.time.LocalDate;
import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.PaymentDailySummaryRow;

/** 収納実績の参照(payments。財務会計連携CSV=REQ-020 の入力)。 */
public interface PaymentRepository {

  /** 期間内の収納日計(歳入科目×収納方法×施設別。還付は還付区分で別行=KSM-DDD-001 §7.3)。 */
  List<PaymentDailySummaryRow> findDailySummaries(LocalDate fromDate, LocalDate toDate);
}
