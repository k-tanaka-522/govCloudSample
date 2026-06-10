package jp.lg.kasumidai.yoyaku.domain.common;

/**
 * 業務例外(KSM-DEV-001 §5.1:業務例外と技術例外の区別)。
 * 共通例外ハンドラ(presentation.error)で RFC 9457 形式に変換する(KSM-DEV-002 S-23)。
 */
public class DomainException extends RuntimeException {

  private final String problemType;

  public DomainException(String problemType, String message) {
    super(message);
    this.problemType = problemType;
  }

  public String getProblemType() {
    return problemType;
  }
}
