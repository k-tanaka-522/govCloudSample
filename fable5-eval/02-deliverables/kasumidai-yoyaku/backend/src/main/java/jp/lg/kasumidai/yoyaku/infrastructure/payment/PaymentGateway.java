package jp.lg.kasumidai.yoyaku.infrastructure.payment;

/**
 * 決済代行の抽象IF(REQ-016。KSM-DDD-001 1.1版 §7.1)。
 *
 * <p>【設計乖離の記録】KSM-DDD-001 §7.1は本ポートを「ドメイン層に定義」とするが、
 * 開発標準(KSM-DEV-001 §2)の機械検査規則(インフラ層から上位層への参照禁止)の下では
 * インフラ層実装がドメイン層インターフェースを実装できないため、ポートをインフラ層に置き
 * ドメイン層から参照する構造とした(実装完了報告書の乖離一覧 D-1)。
 */
public interface PaymentGateway {

  /** 決済セッション(リダイレクト型=カード情報非経由。SAQ A相当)。 */
  record CheckoutSession(String redirectUrl, String transactionId) {}

  /** 決済セッションを生成する(取引IDは billing_id 起点の一意キー)。 */
  CheckoutSession createCheckout(long billingId, long amountYen);

  /** Webhook署名(HMAC)を検証する(KSM-DEV-002 S-81:検証失敗は受信記録の上で拒否)。 */
  boolean verifyWebhookSignature(String payload, String signatureHex);
}
