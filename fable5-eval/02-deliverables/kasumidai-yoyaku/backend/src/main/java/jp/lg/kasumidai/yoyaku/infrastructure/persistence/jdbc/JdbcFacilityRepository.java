package jp.lg.kasumidai.yoyaku.infrastructure.persistence.jdbc;

import java.util.Objects;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.FacilityRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 施設・面室参照のJDBC実装。 */
@Repository
public class JdbcFacilityRepository implements FacilityRepository {

  private final JdbcTemplate jdbc;

  public JdbcFacilityRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public long findFacilityIdOfUnit(long unitId) {
    Long facilityId =
        jdbc.queryForObject(
            "SELECT facility_id FROM units WHERE unit_id = ?", Long.class, unitId);
    return Objects.requireNonNull(facilityId, "面・室が存在しません: " + unitId);
  }
}
