package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

/** 取消規則行(施設別マスタ。初期値はQA No.11確定値:7日前まで無料/6日前以降100%)。 */
public record CancellationPolicyRow(int freeCancelDaysBefore, int chargeRatePercent) {}
