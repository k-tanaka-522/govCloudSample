package jp.lg.kasumidai.yoyaku.infrastructure.persistence;

/** 利用者の参照(users。認証属性の正はDB=KSM-ADR-002)。 */
public interface UserRepository {

  /** 利用者区分ID(REQ-002:個人/団体/市外等)。 */
  long findCategoryId(long userId);
}
