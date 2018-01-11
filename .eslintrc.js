module.exports = {
  extends: [
    '@condenast/eslint-config-condenast/teams/partnerships',
    '@condenast/eslint-config-condenast/rules/ext/mocha'
  ],
  rules: {
    'no-bitwise': ['error', { 'int32Hint': true }]
  }
}
