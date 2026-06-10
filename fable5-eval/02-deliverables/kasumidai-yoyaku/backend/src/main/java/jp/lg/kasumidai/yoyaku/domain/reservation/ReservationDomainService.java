package jp.lg.kasumidai.yoyaku.domain.reservation;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import jp.lg.kasumidai.yoyaku.domain.common.DomainException;
import jp.lg.kasumidai.yoyaku.domain.fee.FeeBreakdownItem;
import jp.lg.kasumidai.yoyaku.domain.fee.FeeCalculation;
import jp.lg.kasumidai.yoyaku.domain.fee.FeeCalculator;
import jp.lg.kasumidai.yoyaku.domain.fee.FeeResolver;
import jp.lg.kasumidai.yoyaku.domain.fee.FeeTableEntry;
import jp.lg.kasumidai.yoyaku.infrastructure.notification.NotificationQueue;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.AuditLogRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.FeeMasterRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.LimitRuleRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.ReservationRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.UserRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.AuditLogRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.FeeEntryRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LimitRuleRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.NewReservationRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.SlotKeyRow;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

/**
 * 先着予約・一括予約のドメインサービス(REQ-007/009/010。KSM-BRL-001 §1/§2/§3)。
 * トランザクション境界はアプリケーション層のユースケース(KSM-DEV-001 §5.1)。
 */
@Service
public class ReservationDomainService {

  /** 支払期限の初期日数(施設別マスタ化予定。当選確定期限と同じ7日=KSM-BRL-001 §5.1)。 */
  public static final int DEFAULT_PAYMENT_DUE_DAYS = 7;

  /** 申込内容(設備は明細単位=KSM-DDD-001 §4.4)。 */
  public record ReservationCommand(
      long userId, long facilityId, String purpose, List<SlotRequest> slots) {}

  /** 予約成立の結果(算定明細を含む)。 */
  public record ReservationGrant(long reservationId, FeeCalculation fee, OffsetDateTime dueAt) {}

  private final ReservationRepository reservationRepository;
  private final FeeMasterRepository feeMasterRepository;
  private final LimitRuleRepository limitRuleRepository;
  private final UserRepository userRepository;
  private final AuditLogRepository auditLogRepository;
  private final NotificationQueue notificationQueue;
  private final BulkReservationValidator bulkValidator = new BulkReservationValidator();
  private final FeeResolver feeResolver = new FeeResolver();
  private final FeeCalculator feeCalculator = new FeeCalculator();
  private final ObjectMapper objectMapper = new ObjectMapper();

  public ReservationDomainService(
      ReservationRepository reservationRepository,
      FeeMasterRepository feeMasterRepository,
      LimitRuleRepository limitRuleRepository,
      UserRepository userRepository,
      AuditLogRepository auditLogRepository,
      NotificationQueue notificationQueue) {
    this.reservationRepository = reservationRepository;
    this.feeMasterRepository = feeMasterRepository;
    this.limitRuleRepository = limitRuleRepository;
    this.userRepository = userRepository;
    this.auditLogRepository = auditLogRepository;
    this.notificationQueue = notificationQueue;
  }

  /**
   * 先着予約申込(一括対応)。全件成立または全件不成立(REQ-010)。
   *
   * @param command 申込内容
   * @param now 判定時点(L-4 受付開始判定・支払期限起点)
   */
  public ReservationGrant reserve(ReservationCommand command, LocalDateTime now) {
    long categoryId = userRepository.findCategoryId(command.userId());
    List<LimitViolation> violations = validateLimits(command, categoryId, now);
    BulkReservationValidator.Result result =
        bulkValidator.validate(command.slots(), this::checkSlotAvailability, violations);
    if (!result.allGranted()) {
      throw new SlotConflictException(result.conflicts());
    }
    FeeCalculation fee = calculateFee(command, categoryId, now.toLocalDate());
    OffsetDateTime dueAt =
        now.plusDays(DEFAULT_PAYMENT_DUE_DAYS).atZone(java.time.ZoneId.of("Asia/Tokyo")).toOffsetDateTime();
    long reservationId = insertPendingReservation(command, fee, dueAt);
    auditLogRepository.append(
        new AuditLogRow(
            "user", command.userId(), "RESERVATION_CREATE", "reservation:" + reservationId,
            "明細" + command.slots().size() + "件・請求額" + fee.billedAmountYen() + "円"));
    notificationQueue.publish(
        new NotificationQueue.NotificationMessage("RESERVATION_PENDING", reservationId));
    return new ReservationGrant(reservationId, fee, dueAt);
  }

  /**
   * 抽選当選分の予約生成(pending・支払期限付き=KSM-BRL-001 §5.3-4)。
   * 上限は抽選時に再判定済みのため省略し、DBレベルの競合のみ検出する。
   */
  public Optional<Long> reserveForLotteryWin(
      long userId, List<SlotRequest> slots, LocalDateTime now) {
    long categoryId = userRepository.findCategoryId(userId);
    FeeCalculation fee =
        calculateFee(new ReservationCommand(userId, 0L, "抽選当選", slots), categoryId, now.toLocalDate());
    OffsetDateTime dueAt =
        now.plusDays(DEFAULT_PAYMENT_DUE_DAYS).atZone(java.time.ZoneId.of("Asia/Tokyo")).toOffsetDateTime();
    try {
      long reservationId =
          insertPendingReservation(new ReservationCommand(userId, 0L, "抽選当選", slots), fee, dueAt);
      return Optional.of(reservationId);
    } catch (DuplicateKeyException e) {
      // 抽選中の割当とDB実態の競合(運用上は発生しない想定)。当該当選は不成立として扱う
      return Optional.empty();
    }
  }

  private List<LimitViolation> validateLimits(
      ReservationCommand command, long categoryId, LocalDateTime now) {
    LimitRuleRow ruleRow = limitRuleRepository.findRule(command.facilityId(), categoryId);
    ReservationLimitPolicy policy = new ReservationLimitPolicy(toRule(ruleRow));
    Map<java.time.YearMonth, Integer> monthly =
        reservationRepository.countActiveSlotsByMonth(command.userId(), command.facilityId());
    Map<LocalDate, Integer> daily =
        reservationRepository.countActiveSlotsByDate(command.userId(), command.facilityId());
    int open = reservationRepository.countOpenReservations(command.userId(), now.toLocalDate());
    return policy.validate(monthly, daily, open, command.slots(), now);
  }

  private Optional<ConflictReason> checkSlotAvailability(SlotRequest slot) {
    SlotKeyRow key = new SlotKeyRow(slot.unitId(), slot.useDate(), slot.slotId());
    Map<SlotKeyRow, String> closures = reservationRepository.findClosedOrPrioritySlots(List.of(key));
    if (closures.containsKey(key)) {
      return Optional.of(
          "priority".equals(closures.get(key)) ? ConflictReason.PRIORITY_SLOT : ConflictReason.CLOSED);
    }
    if (!reservationRepository.findConflictingSlots(List.of(key)).isEmpty()) {
      return Optional.of(ConflictReason.RESERVED);
    }
    return Optional.empty();
  }

  private FeeCalculation calculateFee(
      ReservationCommand command, long categoryId, LocalDate applicationDate) {
    List<FeeBreakdownItem> items = new ArrayList<>();
    for (SlotRequest slot : bulkValidator.sorted(command.slots())) {
      List<FeeTableEntry> entries =
          feeMasterRepository.findFeeEntries(slot.unitId(), slot.slotId(), categoryId).stream()
              .map(this::toEntry)
              .toList();
      // 料金適用基準日=申込(使用許可)日(QA No.12。KSM-BRL-001 1.1版 §3.1)
      FeeTableEntry applied = feeResolver.resolve(entries, applicationDate);
      items.add(
          new FeeBreakdownItem(
              slot.unitId(), slot.useDate(), slot.slotId(), applied.feeId(), applied.amountYen(), 0L));
    }
    return feeCalculator.calculate(items, 0L);
  }

  private long insertPendingReservation(
      ReservationCommand command, FeeCalculation fee, OffsetDateTime dueAt) {
    List<NewReservationRow.Detail> details =
        fee.items().stream()
            .map(
                item ->
                    new NewReservationRow.Detail(
                        item.unitId(), item.useDate(), item.slotId(), item.totalYen()))
            .toList();
    try {
      return reservationRepository.insertReservation(
          new NewReservationRow(
              command.userId(),
              command.purpose(),
              "pending",
              dueAt,
              fee.baseAmountYen(),
              fee.equipmentAmountYen(),
              fee.exemptionAmountYen(),
              toJson(fee),
              details));
    } catch (DuplicateKeyException e) {
      // 同時申込の競合:uq_active_slot 制約違反(KSM-BRL-001 §2.2-1)→ 409 全件不成立
      throw new SlotConflictException(
          command.slots().stream()
              .map(slot -> new SlotConflict(slot, ConflictReason.RESERVED))
              .toList());
    }
  }

  private String toJson(FeeCalculation fee) {
    try {
      return objectMapper.writeValueAsString(fee.items());
    } catch (JsonProcessingException e) {
      throw new DomainException("calculation-detail-error", "算定明細の保存に失敗しました");
    }
  }

  private ReservationLimitRule toRule(LimitRuleRow row) {
    return new ReservationLimitRule(
        row.monthlyMaxSlots(),
        row.sameDayMaxSlots(),
        row.maxOpenReservations(),
        row.acceptStartMonthsBefore(),
        row.acceptStartHour());
  }

  private FeeTableEntry toEntry(FeeEntryRow row) {
    return new FeeTableEntry(row.feeId(), row.validFrom(), row.amountYen());
  }
}
