/** CDK assertions テスト(KSM-ADR-006 決定2:暗号化・タグ・削除保護のプロパティ検査)。 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {}],
  },
};
