package jp.lg.kasumidai.yoyaku.presentation.api.publicapi;

import java.time.YearMonth;
import java.util.List;
import java.util.concurrent.TimeUnit;
import jp.lg.kasumidai.yoyaku.application.availability.GetAvailabilityUseCase;
import jp.lg.kasumidai.yoyaku.domain.availability.AvailabilitySlot;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 空き状況照会API(REQ-006。未ログイン・GETのみ・CloudFrontキャッシュ対象=KSM-DDD-001 §4.1)。
 * Cache-Control 60秒(KSM-ADR-009。個人情報を含まない公開データのみ)。
 */
@RestController
@RequestMapping("/api/public/v1")
public class AvailabilityController {

  private static final long CACHE_SECONDS = 60L;

  private final GetAvailabilityUseCase getAvailabilityUseCase;

  public AvailabilityController(GetAvailabilityUseCase getAvailabilityUseCase) {
    this.getAvailabilityUseCase = getAvailabilityUseCase;
  }

  @GetMapping("/availabilities")
  public ResponseEntity<List<AvailabilitySlotDto>> getAvailabilities(
      @RequestParam("facilityId") long facilityId, @RequestParam("month") String month) {
    List<AvailabilitySlot> slots =
        getAvailabilityUseCase.execute(facilityId, YearMonth.parse(month));
    List<AvailabilitySlotDto> body = slots.stream().map(AvailabilitySlotDto::from).toList();
    return ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(CACHE_SECONDS, TimeUnit.SECONDS).cachePublic())
        .body(body);
  }

  /** レスポンスDTO(エンティティをUI層へ直接公開しない=KSM-DEV-001 §5.1)。 */
  public record AvailabilitySlotDto(long unitId, String useDate, long slotId, String status) {

    static AvailabilitySlotDto from(AvailabilitySlot slot) {
      return new AvailabilitySlotDto(
          slot.unitId(), slot.useDate().toString(), slot.slotId(), slot.status().name());
    }
  }
}
