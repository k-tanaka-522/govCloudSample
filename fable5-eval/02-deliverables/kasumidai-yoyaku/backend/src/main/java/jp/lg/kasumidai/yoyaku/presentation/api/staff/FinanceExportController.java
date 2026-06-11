package jp.lg.kasumidai.yoyaku.presentation.api.staff;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import jp.lg.kasumidai.yoyaku.application.finance.ExportFinanceCsvUseCase;
import jp.lg.kasumidai.yoyaku.domain.finance.FinanceExportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 財務会計連携CSV出力API(REQ-020。SC-S14。会計担当ロール)。
 * 職員向けAPIは /api/staff/* に限定(WAF IP制限と整合=KSM-ADR-003)。
 * 個人情報を含まないが、収納データのため no-store を明示(KSM-ADR-009決定4)。
 *
 * <p>【P4スタブ宣言】職員認可(ロール×施設インターセプタ=KSM-DEV-002 S-12/S-13)は
 * 認証BFFと併せて実装予定。暫定ヘッダは ReservationController と同様(実装完了報告書 S-1)。
 */
@RestController
@RequestMapping("/staff/v1/finance-exports")
public class FinanceExportController {

  private final ExportFinanceCsvUseCase exportFinanceCsvUseCase;

  public FinanceExportController(ExportFinanceCsvUseCase exportFinanceCsvUseCase) {
    this.exportFinanceCsvUseCase = exportFinanceCsvUseCase;
  }

  @PostMapping
  public ResponseEntity<byte[]> export(
      @RequestHeader("X-Dev-Staff-Id") long staffId, @Valid @RequestBody Request request) {
    FinanceExportService.ExportResult result =
        exportFinanceCsvUseCase.execute(request.fromDate(), request.toDate(), staffId);
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + result.filename())
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .contentType(new MediaType("text", "csv", java.nio.charset.Charset.forName("windows-31j")))
        .body(result.content());
  }

  /** 期間指定(様式第12号=日計集計形式)。 */
  public record Request(@NotNull LocalDate fromDate, @NotNull LocalDate toDate) {}
}
