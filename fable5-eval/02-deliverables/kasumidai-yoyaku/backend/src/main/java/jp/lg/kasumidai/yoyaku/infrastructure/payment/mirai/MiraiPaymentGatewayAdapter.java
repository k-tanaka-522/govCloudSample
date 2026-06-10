package jp.lg.kasumidai.yoyaku.infrastructure.payment.mirai;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import jp.lg.kasumidai.yoyaku.infrastructure.payment.PaymentGateway;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * みらい収納サービス株式会社向けアダプタ(QA No.18:市直接契約締結済み・令和8年6月5日)。
 *
 * <p>【P4スタブ宣言】Webhook署名検証(HMAC-SHA256)は実装済み。決済セッション生成は
 * 同社接続仕様書(市から提供予定)の受領後に通信部を実装する(実装完了報告書の未実装一覧 S-2)。
 * 署名鍵は Secrets Manager から注入し、コード・設定ファイルへの直書きを禁止する(KSM-DEV-002 S-42)。
 */
@Component
public class MiraiPaymentGatewayAdapter implements PaymentGateway {

  private static final String HMAC_ALGORITHM = "HmacSHA256";

  private final String webhookSecret;

  public MiraiPaymentGatewayAdapter(@Value("${yoyaku.payment.webhook-secret:}") String webhookSecret) {
    this.webhookSecret = webhookSecret;
  }

  @Override
  public CheckoutSession createCheckout(long billingId, long amountYen) {
    throw new UnsupportedOperationException(
        "P4スタブ:みらい収納サービス接続仕様書の受領後に実装する(KSM-DDD-001 1.1版 §7.1)");
  }

  @Override
  public boolean verifyWebhookSignature(String payload, String signatureHex) {
    if (webhookSecret.isEmpty() || signatureHex == null || signatureHex.isEmpty()) {
      return false;
    }
    try {
      Mac mac = Mac.getInstance(HMAC_ALGORITHM);
      mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
      byte[] expected = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
      byte[] actual = HexFormat.of().parseHex(signatureHex);
      return MessageDigest.isEqual(expected, actual);
    } catch (java.security.GeneralSecurityException | IllegalArgumentException e) {
      return false;
    }
  }
}
