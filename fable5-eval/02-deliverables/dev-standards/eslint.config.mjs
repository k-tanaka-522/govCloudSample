// 霞台市公共施設予約管理システム TypeScript コーディング規約(KSM-DEV-001 §3〜§5.2)
// 対象: フロントエンド(React)/ IaC(AWS CDK)/ 共有モジュール
// CI: eslint . --max-warnings 0 で違反1件以上をビルド失敗とする(frontend-quality / iac-quality ジョブ)
//
// 規約根拠:
//  - 複雑度10: NIST SP 500-235 / ESLint complexity ルール
//    https://eslint.org/docs/latest/rules/complexity (参照日: 令和8年6月10日)
//  - 命名規則: typescript-eslint naming-convention
//    https://typescript-eslint.io/rules/naming-convention/ (参照日: 令和8年6月10日)

import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      // ==== §3-1 循環的複雑度 10 以内(NIST SP 500-235) ====
      complexity: ['error', { max: 10 }],

      // ==== §3-2 関数80行・ファイル500行以内 ====
      'max-lines-per-function': [
        'error',
        { max: 80, skipBlankLines: true, skipComments: true },
      ],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],

      // ==== §3-3 ネスト深さ ====
      'max-depth': ['error', 4],

      // ==== §3-4 マジックナンバー禁止 ====
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2],
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreNumericLiteralTypes: true,
        },
      ],

      // ==== §5.2 any 禁止(明示的エスケープのみ) ====
      '@typescript-eslint/no-explicit-any': 'error',

      // ==== §4 命名規則 ====
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'function', format: ['camelCase', 'PascalCase'] }, // React コンポーネント許容
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        {
          selector: 'objectLiteralProperty',
          format: null, // 外部API(決済代行等)のプロパティ名は対象外
        },
      ],
    },
  },
  // ==== §5.2 アクセシビリティ(REQ-014 / JIS X 8341-3:2016 AA)── フロントエンドのみ ====
  {
    files: ['apps/frontend/**/*.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  // ==== IaC(CDK): コンストラクトIDは PascalCase、リソース名は yoyaku-{env}-{role} を cdk-nag 側で検査 ====
  {
    files: ['infra/**/*.ts'],
    rules: {
      'max-lines-per-function': ['error', { max: 120 }], // Stack 定義は宣言列挙のため緩和(理由: KSM-DEV-001 §5.2)
    },
  },
);
