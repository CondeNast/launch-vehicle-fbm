module.exports = {
  extends: [
    'airbnb'
  ],
  env: {
    mocha: true
  },
  rules: {
    // Be consistent about arrow function parentheses
    'arrow-parens': ['error', 'always'],
    // Allow private notation with underscores
    'no-underscore-dangle': ['off'],
    // Allow underlines and Flow comment syntax
    'spaced-comment': ['error', 'always', {exceptions: ['/'], markers: [':', '::']}]
  }
};
