// Similar to a 'messages.pot' for internationalization
module.exports = {
  quiz_loaded: 'Quizzes loaded',
  catch_all: [
    'catch all number one',
    'catch all number two',
    'catch all number three'
  ],
  // You can't .split() unicode, but spread works
  // https://ponyfoo.com/articles/es6-strings-and-unicode-in-depth
  emoji: [...'💋😂😽'],
  help: 'This is the help message',
  pong: 'PONG!'
};
