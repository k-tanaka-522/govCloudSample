/**
 * 霞台市公共施設予約管理システム TS レイヤー依存方向検査(KSM-DEV-001 §2)
 *
 * UI(src/ui) → アプリケーション(src/application) → ドメイン(src/domain) → インフラ(src/infrastructure)
 * の一方向・隣接層のみ参照可。逆方向・飛び越し・循環参照を error とし、
 * CI(frontend-quality ジョブ)で depcruise --config dependency-cruiser.cjs src がエラー時に失敗する。
 *
 * 根拠: dependency-cruiser rules reference
 * https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md (参照日: 令和8年6月10日)
 */
module.exports = {
  forbidden: [
    // ==== 循環依存禁止(§2) ====
    {
      name: 'no-circular',
      severity: 'error',
      comment: '循環参照禁止(KSM-DEV-001 §2)',
      from: {},
      to: { circular: true },
    },

    // ==== 逆方向依存の禁止 ====
    {
      name: 'domain-not-to-application-or-ui',
      severity: 'error',
      comment: 'ドメイン層から上位層(UI・アプリケーション)への依存禁止',
      from: { path: '^src/domain' },
      to: { path: '^src/(ui|application)' },
    },
    {
      name: 'application-not-to-ui',
      severity: 'error',
      comment: 'アプリケーション層からUI層への依存禁止',
      from: { path: '^src/application' },
      to: { path: '^src/ui' },
    },
    {
      name: 'infrastructure-not-upward',
      severity: 'error',
      comment: 'インフラ層から上位層への依存禁止',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/(ui|application|domain)' },
    },

    // ==== 飛び越し依存の禁止(隣接層のみ参照可) ====
    {
      name: 'ui-only-to-application',
      severity: 'error',
      comment: 'UI層はアプリケーション層のみ参照可(ドメイン・インフラへの直接参照禁止)',
      from: { path: '^src/ui' },
      to: { path: '^src/(domain|infrastructure)' },
    },
    {
      name: 'application-not-to-infrastructure',
      severity: 'error',
      comment: 'アプリケーション層はドメイン層のみ参照可(インフラへの直接参照禁止)',
      from: { path: '^src/application' },
      to: { path: '^src/infrastructure' },
    },

    // ==== 一般衛生 ====
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'どこからも参照されないモジュール(削除漏れ)の検出',
      from: { orphan: true, pathNot: '\\.(d\\.ts)$|(^|/)index\\.ts$' },
      to: {},
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: '本番コードから devDependencies への依存禁止',
      from: { path: '^src', pathNot: '\\.(spec|test)\\.(ts|tsx)$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    reporterOptions: { dot: { collapsePattern: 'node_modules/[^/]+' } },
  },
};
