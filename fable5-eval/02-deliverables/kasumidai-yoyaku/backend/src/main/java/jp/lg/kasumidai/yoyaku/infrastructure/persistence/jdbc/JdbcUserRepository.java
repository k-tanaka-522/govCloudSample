package jp.lg.kasumidai.yoyaku.infrastructure.persistence.jdbc;

import java.util.Objects;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.UserRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 利用者参照のJDBC実装。 */
@Repository
public class JdbcUserRepository implements UserRepository {

  private final JdbcTemplate jdbc;

  public JdbcUserRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public long findCategoryId(long userId) {
    Long categoryId =
        jdbc.queryForObject(
            "SELECT user_category_id FROM users WHERE user_id = ?", Long.class, userId);
    return Objects.requireNonNull(categoryId, "利用者が存在しません: " + userId);
  }
}
