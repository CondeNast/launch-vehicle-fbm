module.exports = {
  extends: [
    '@condenast/eslint-config-condenast'
  ],
  rules: {
    quotes: ['warn', 'single', {avoidEscape: true}],
    // Allow underlines and Flow comment syntax
    'spaced-comment': ['error', 'always', {exceptions: ['/'], markers: [':', '::']}]
  }
};
