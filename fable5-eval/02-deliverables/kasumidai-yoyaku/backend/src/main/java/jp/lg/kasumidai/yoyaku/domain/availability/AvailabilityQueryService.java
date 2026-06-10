package jp.lg.kasumidai.yoyaku.domain.availability;

import java.time.YearMonth;
import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.AvailabilityRepository;
import org.springframework.stereotype.Service;

/** 空き状況照会(REQ-006。未ログイン・60秒キャッシュ=KSM-ADR-009)。 */
@Service
public class AvailabilityQueryService {

  private final AvailabilityRepository availabilityRepository;

  public AvailabilityQueryService(AvailabilityRepository availabilityRepository) {
    this.availabilityRepository = availabilityRepository;
  }

  public List<AvailabilitySlot> findMonthly(long facilityId, YearMonth month) {
    return availabilityRepository.findMonthlyAvailability(facilityId, month).stream()
        .map(
            row ->
                new AvailabilitySlot(
                    row.unitId(), row.useDate(), row.slotId(), toStatus(row.status())))
        .toList();
  }

  private AvailabilitySlot.Status toStatus(String status) {
    return switch (status) {
      case "reserved" -> AvailabilitySlot.Status.RESERVED;
      case "closed" -> AvailabilitySlot.Status.CLOSED;
      case "priority" -> AvailabilitySlot.Status.PRIORITY;
      default -> AvailabilitySlot.Status.OPEN;
    };
  }
}
