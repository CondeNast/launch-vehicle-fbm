module.exports = {
  extends: [
    'airbnb'
  ],
  env: {
    mocha: true
  },
  rules: {
    // PROJECT OVERRIDES
    // Allow `session` mutation
    'no-param-reassign': ['error', {props: false}],

    // DISAGREE WITH AIRBNB

    // Be consistent about arrow function parentheses
    'arrow-parens': ['error', 'always'],
    // Trailing commas aren't in ESNext yet
    'comma-dangle': ['error', 'never'],
    // Allow underlines and Flow comment syntax
    'spaced-comment': ['error', 'always', {exceptions: ['/'], markers: [':', '::']}],

    // We know what we're doing
    'global-require': ['off'],
    'import/newline-after-import': ['off'],
    'import/no-dynamic-require': ['off'],
    'no-bitwise': ['off'],
    'no-plusplus': ['off'],
    'no-shadow': ['off'],
    'no-underscore-dangle': ['off'],
    'no-unused-expressions': ['off']
  }
};
