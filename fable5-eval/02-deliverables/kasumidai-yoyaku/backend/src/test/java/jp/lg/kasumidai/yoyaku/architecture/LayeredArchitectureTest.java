package jp.lg.kasumidai.yoyaku.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition;

/**
 * レイヤー構成・依存方向の機械検査(KSM-DEV-001 §2、§5.1)。
 *
 * <p>UI(presentation)→アプリケーション(application)→ドメイン(domain)→インフラ(infrastructure)
 * の一方向・隣接層のみ参照可。逆方向・飛び越し・循環参照はビルド失敗とする。
 * 本テストは backend-quality ジョブ(ci-quality-gate.yml)で単体テストとして常時実行される。
 *
 * <p>根拠: ArchUnit User Guide - Layered Architecture
 * https://www.archunit.org/userguide/html/000_Index.html (参照日: 令和8年6月10日)
 */
@AnalyzeClasses(
    packages = "jp.lg.kasumidai.yoyaku",
    importOptions = ImportOption.DoNotIncludeTests.class)
public final class LayeredArchitectureTest {

  private static final String PRESENTATION = "Presentation";
  private static final String APPLICATION = "Application";
  private static final String DOMAIN = "Domain";
  private static final String INFRASTRUCTURE = "Infrastructure";

  /** §2: 一方向依存(隣接層のみ)。 */
  @ArchTest
  static final ArchRule layerDependenciesAreOneWay =
      layeredArchitecture()
          .consideringOnlyDependenciesInLayers()
          .layer(PRESENTATION).definedBy("jp.lg.kasumidai.yoyaku.presentation..")
          .layer(APPLICATION).definedBy("jp.lg.kasumidai.yoyaku.application..")
          .layer(DOMAIN).definedBy("jp.lg.kasumidai.yoyaku.domain..")
          .layer(INFRASTRUCTURE).definedBy("jp.lg.kasumidai.yoyaku.infrastructure..")
          .whereLayer(PRESENTATION).mayNotBeAccessedByAnyLayer()
          .whereLayer(APPLICATION).mayOnlyBeAccessedByLayers(PRESENTATION)
          .whereLayer(DOMAIN).mayOnlyBeAccessedByLayers(APPLICATION)
          .whereLayer(INFRASTRUCTURE).mayOnlyBeAccessedByLayers(DOMAIN);

  /** §2: パッケージ間の循環依存禁止。 */
  @ArchTest
  static final ArchRule noPackageCycles =
      SlicesRuleDefinition.slices()
          .matching("jp.lg.kasumidai.yoyaku.(**)")
          .should()
          .beFreeOfCycles();

  /** §5.1: トランザクション境界はアプリケーション層のユースケースクラスのみ。 */
  @ArchTest
  static final ArchRule transactionalOnlyInApplicationLayer =
      classes()
          .that()
          .areAnnotatedWith("org.springframework.transaction.annotation.Transactional")
          .or()
          .containAnyMethodsThat(
              method ->
                  method.isAnnotatedWith(
                      "org.springframework.transaction.annotation.Transactional"))
          .should()
          .resideInAPackage("jp.lg.kasumidai.yoyaku.application..")
          .as("@Transactional はアプリケーション層のユースケースにのみ配置する(KSM-DEV-001 §5.1)");
}
