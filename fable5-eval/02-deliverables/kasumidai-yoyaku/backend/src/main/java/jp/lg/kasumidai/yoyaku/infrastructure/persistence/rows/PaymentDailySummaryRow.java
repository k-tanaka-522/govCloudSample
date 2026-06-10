package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

import java.time.LocalDate;

/**
 * 収納日計の集計行(財務会計連携CSV=会計課様式第12号の入力。KSM-DDD-001 1.1版 §7.3=QA No.21)。
 */
public record PaymentDailySummaryRow(
    LocalDate slipDate,
    int fiscalYear,
    String accountCode,
    String revenueCode,
    String methodCode,
    long amountYen,
    int count,
    String remarks,
    String facilityCode) {}
