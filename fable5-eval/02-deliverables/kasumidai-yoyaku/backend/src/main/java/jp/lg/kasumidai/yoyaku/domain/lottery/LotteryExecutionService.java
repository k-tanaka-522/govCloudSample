package jp.lg.kasumidai.yoyaku.domain.lottery;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import jp.lg.kasumidai.yoyaku.domain.common.DomainException;
import jp.lg.kasumidai.yoyaku.domain.reservation.ReservationDomainService;
import jp.lg.kasumidai.yoyaku.domain.reservation.ReservationLimitPolicy;
import jp.lg.kasumidai.yoyaku.domain.reservation.ReservationLimitRule;
import jp.lg.kasumidai.yoyaku.domain.reservation.SlotRequest;
import jp.lg.kasumidai.yoyaku.infrastructure.notification.NotificationQueue;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.AuditLogRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.FacilityRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.LimitRuleRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.LotteryRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.ReservationRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.UserRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.AuditLogRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LimitRuleRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LotteryEntryRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LotteryResultRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.SlotKeyRow;
import org.springframework.stereotype.Service;

/**
 * 抽選実行(JB-01。REQ-008。KSM-BRL-001 §5)。
 * 実行前チェック(前回実行なし)・乱数キーによる公平抽選・当選分の予約生成(pending)・
 * 当落通知のSQS投入・実行サマリの記録を行う。再実行安全(KSM-DDD-001 §6.2)。
 */
@Service
public class LotteryExecutionService {

  /** 実行サマリ(JB-01がCloudWatchメトリクス・SC-S09へ出力=KSM-DDD-001 §6.2-3)。 */
  public record ExecutionSummary(int entryCount, int wonCount, int lostCount) {}

  private final LotteryRepository lotteryRepository;
  private final ReservationRepository reservationRepository;
  private final ReservationDomainService reservationDomainService;
  private final AuditLogRepository auditLogRepository;
  private final NotificationQueue notificationQueue;
  private final UserRepository userRepository;
  private final FacilityRepository facilityRepository;
  private final LimitRuleRepository limitRuleRepository;
  private final LotteryDrawService drawService = new LotteryDrawService();
  private final SecureRandom secureRandom = new SecureRandom();

  public LotteryExecutionService(
      LotteryRepository lotteryRepository,
      ReservationRepository reservationRepository,
      ReservationDomainService reservationDomainService,
      AuditLogRepository auditLogRepository,
      NotificationQueue notificationQueue,
      UserRepository userRepository,
      FacilityRepository facilityRepository,
      LimitRuleRepository limitRuleRepository) {
    this.lotteryRepository = lotteryRepository;
    this.reservationRepository = reservationRepository;
    this.reservationDomainService = reservationDomainService;
    this.auditLogRepository = auditLogRepository;
    this.notificationQueue = notificationQueue;
    this.userRepository = userRepository;
    this.facilityRepository = facilityRepository;
    this.limitRuleRepository = limitRuleRepository;
  }

  /** 抽選を実行する(冪等:実行済み期間は拒否=batch_job_locks と二重の防御)。 */
  public ExecutionSummary execute(long lotteryPeriodId, LocalDateTime now) {
    if (lotteryRepository.isAlreadyDrawn(lotteryPeriodId)) {
      throw new DomainException("lottery-already-drawn", "この抽選期間は実行済みです");
    }
    List<LotteryEntry> entries = assembleEntries(lotteryRepository.findEntries(lotteryPeriodId));
    List<LotteryResult> results =
        drawService.draw(entries, secureRandom, this::isSlotOpen, this::canWinWithinLimits);
    persist(lotteryPeriodId, results, now);
    int won = (int) results.stream().filter(LotteryResult::won).count();
    auditLogRepository.append(
        new AuditLogRow(
            "system", 0L, "LOTTERY_EXECUTE", "lottery_period:" + lotteryPeriodId,
            "申込" + entries.size() + "件・当選" + won + "件"));
    return new ExecutionSummary(entries.size(), won, entries.size() - won);
  }

  /** 平坦行(申込×希望×コマ)からドメインの抽選申込を組み立てる。 */
  List<LotteryEntry> assembleEntries(List<LotteryEntryRow> rows) {
    Map<Long, Map<Integer, List<SlotRequest>>> grouped = new LinkedHashMap<>();
    Map<Long, Long> userIds = new LinkedHashMap<>();
    for (LotteryEntryRow row : rows) {
      userIds.putIfAbsent(row.entryId(), row.userId());
      grouped
          .computeIfAbsent(row.entryId(), id -> new LinkedHashMap<>())
          .computeIfAbsent(row.prefRank(), rank -> new ArrayList<>())
          .add(new SlotRequest(row.unitId(), row.useDate(), row.slotId()));
    }
    List<LotteryEntry> entries = new ArrayList<>();
    for (Map.Entry<Long, Map<Integer, List<SlotRequest>>> entry : grouped.entrySet()) {
      List<LotteryPreference> preferences =
          entry.getValue().entrySet().stream()
              .map(p -> new LotteryPreference(p.getKey(), List.copyOf(p.getValue())))
              .toList();
      entries.add(new LotteryEntry(entry.getKey(), userIds.get(entry.getKey()), preferences));
    }
    return entries;
  }

  /** 当選確定時の上限再判定(L-1〜L-3。KSM-BRL-001 §5.4-1。超過する希望は不成立→次希望を評価)。 */
  private boolean canWinWithinLimits(long userId, List<SlotRequest> slots) {
    long categoryId = userRepository.findCategoryId(userId);
    long facilityId = facilityRepository.findFacilityIdOfUnit(slots.get(0).unitId());
    LimitRuleRow ruleRow = limitRuleRepository.findRule(facilityId, categoryId);
    ReservationLimitPolicy policy =
        new ReservationLimitPolicy(
            new ReservationLimitRule(
                ruleRow.monthlyMaxSlots(),
                ruleRow.sameDayMaxSlots(),
                ruleRow.maxOpenReservations(),
                ruleRow.acceptStartMonthsBefore(),
                ruleRow.acceptStartHour()));
    return policy
        .validateForLotteryWin(
            reservationRepository.countActiveSlotsByMonth(userId, facilityId),
            reservationRepository.countActiveSlotsByDate(userId, facilityId),
            reservationRepository.countOpenReservations(userId, slots.get(0).useDate()),
            slots)
        .isEmpty();
  }

  private boolean isSlotOpen(SlotRequest slot) {
    SlotKeyRow key = new SlotKeyRow(slot.unitId(), slot.useDate(), slot.slotId());
    return reservationRepository.findConflictingSlots(List.of(key)).isEmpty()
        && reservationRepository.findClosedOrPrioritySlots(List.of(key)).isEmpty();
  }

  private void persist(long lotteryPeriodId, List<LotteryResult> results, LocalDateTime now) {
    List<LotteryResultRow> rows =
        results.stream()
            .map(
                r ->
                    new LotteryResultRow(
                        r.entryId(), r.userId(), r.randomKey(), r.won(), r.wonRank(), r.losingOrder()))
            .toList();
    lotteryRepository.saveResults(lotteryPeriodId, rows);
    for (LotteryResult result : results) {
      if (result.won()) {
        reservationDomainService.reserveForLotteryWin(result.userId(), result.wonSlots(), now);
      }
      notificationQueue.publish(
          new NotificationQueue.NotificationMessage(
              result.won() ? "LOTTERY_WON" : "LOTTERY_LOST", result.entryId()));
    }
  }
}
