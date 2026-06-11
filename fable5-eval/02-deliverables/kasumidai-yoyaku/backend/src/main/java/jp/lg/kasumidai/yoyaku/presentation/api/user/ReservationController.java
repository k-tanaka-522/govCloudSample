package jp.lg.kasumidai.yoyaku.presentation.api.user;

import jakarta.validation.Valid;
import java.util.List;
import jp.lg.kasumidai.yoyaku.application.reservation.CancelReservationUseCase;
import jp.lg.kasumidai.yoyaku.application.reservation.ReserveFacilityUseCase;
import jp.lg.kasumidai.yoyaku.domain.reservation.CancellationService;
import jp.lg.kasumidai.yoyaku.domain.reservation.ReservationDomainService;
import jp.lg.kasumidai.yoyaku.domain.reservation.SlotRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 利用者向け予約API(REQ-007/010/011。KSM-DDD-001 §4.3)。
 *
 * <p>【P4スタブ宣言】利用者IDは本来 Cognito BFF(KSM-ADR-004)のトークンから解決する
 * (リクエスト中のIDを信用しない=KSM-DEV-002 S-11)。BFF実装まではdev環境限定の
 * 暫定ヘッダ(X-Dev-User-Id)で代替する(実装完了報告書 未実装一覧 S-1。本番経路では使用不可)。
 */
@RestController
@RequestMapping("/user/v1/reservations")
public class ReservationController {

  private final ReserveFacilityUseCase reserveFacilityUseCase;
  private final CancelReservationUseCase cancelReservationUseCase;

  public ReservationController(
      ReserveFacilityUseCase reserveFacilityUseCase,
      CancelReservationUseCase cancelReservationUseCase) {
    this.reserveFacilityUseCase = reserveFacilityUseCase;
    this.cancelReservationUseCase = cancelReservationUseCase;
  }

  /** 先着予約申込(一括対応。全件成立=201/全件不成立=409)。 */
  @PostMapping
  public ResponseEntity<ReservationResponseDto> create(
      @RequestHeader("X-Dev-User-Id") long userId,
      @Valid @RequestBody ReservationRequestDto request) {
    List<SlotRequest> slots =
        request.items().stream()
            .map(item -> new SlotRequest(item.unitId(), item.useDate(), item.slotId()))
            .toList();
    ReservationDomainService.ReservationGrant grant =
        reserveFacilityUseCase.execute(
            new ReservationDomainService.ReservationCommand(
                userId, request.facilityId(), request.purpose(), slots));
    return ResponseEntity.status(HttpStatus.CREATED).body(ReservationResponseDto.from(grant));
  }

  /** 取消の事前表示(取消期限・キャンセル料・還付見込=SC-U10)。 */
  @GetMapping("/{id}/cancellation")
  public CancellationResponseDto previewCancellation(
      @RequestHeader("X-Dev-User-Id") long userId, @PathVariable("id") long reservationId) {
    return CancellationResponseDto.from(cancelReservationUseCase.preview(reservationId, userId));
  }

  /** 予約取消(キャンセル料・還付見込を返却=KSM-DDD-001 §4.3)。 */
  @PostMapping("/{id}/cancellation")
  public CancellationResponseDto cancel(
      @RequestHeader("X-Dev-User-Id") long userId, @PathVariable("id") long reservationId) {
    return CancellationResponseDto.from(cancelReservationUseCase.execute(reservationId, userId));
  }

  /** 取消応答DTO。 */
  public record CancellationResponseDto(
      long cancellationCharge, long expectedRefund, String freeCancelDeadline, boolean cancelled) {

    static CancellationResponseDto from(CancellationService.CancellationResult result) {
      return new CancellationResponseDto(
          result.chargeYen(),
          result.refundYen(),
          result.freeCancelDeadline().toString(),
          result.cancelled());
    }
  }
}
