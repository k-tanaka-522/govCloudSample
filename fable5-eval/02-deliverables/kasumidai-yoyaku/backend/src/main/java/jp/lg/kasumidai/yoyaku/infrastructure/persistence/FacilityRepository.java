package jp.lg.kasumidai.yoyaku.infrastructure.persistence;

/** 施設・面室の参照(facilities / units)。 */
public interface FacilityRepository {

  /** 面・室の属する施設ID。 */
  long findFacilityIdOfUnit(long unitId);
}
