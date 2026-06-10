package jp.lg.kasumidai.yoyaku.presentation.api.user;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/**
 * 先着予約申込リクエスト(KSM-DDD-001 §4.4)。
 * 全APIの入力DTOにBean Validation必須(KSM-DEV-002 S-53)。
 */
public record ReservationRequestDto(
    @Positive long facilityId,
    @NotBlank @Size(max = 200) String purpose,
    @NotEmpty @Size(max = 26) List<@Valid Item> items,
    @NotBlank @Size(max = 64) String idempotencyKey) {

  /** 申込コマ(一括予約:連続コマ・複数施設・定期はクライアントで展開)。 */
  public record Item(
      @Positive long unitId, @NotNull LocalDate useDate, @Positive long slotId) {}
}
