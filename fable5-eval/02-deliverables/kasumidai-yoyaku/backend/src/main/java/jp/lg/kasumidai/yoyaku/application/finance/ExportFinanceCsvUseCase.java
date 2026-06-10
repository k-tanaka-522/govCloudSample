package jp.lg.kasumidai.yoyaku.application.finance;

import java.time.LocalDate;
import jp.lg.kasumidai.yoyaku.domain.finance.FinanceExportService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 財務会計連携CSV生成ユースケース(REQ-020。会計課様式第12号=QA No.21)。 */
@Service
public class ExportFinanceCsvUseCase {

  private final FinanceExportService financeExportService;

  public ExportFinanceCsvUseCase(FinanceExportService financeExportService) {
    this.financeExportService = financeExportService;
  }

  @Transactional
  public FinanceExportService.ExportResult execute(LocalDate fromDate, LocalDate toDate, long staffId) {
    return financeExportService.export(fromDate, toDate, staffId);
  }
}
