const assert = require('assert');

const objects = require('../../src/messenger/objects');
const Text = objects.Text;


describe('Messenger Objects', () => {
  let originalDictionary;

  before(() => {
    originalDictionary = objects._dictionary;
  });

  after(() => {
    objects._dictionary = originalDictionary;
  });

  describe('Text', () => {
    it('constructs something', () => {
      const text = new Text('corgi');
      assert.ok(text.text);
    });

    it('constructor saves original text on codetext property', () => {
      const text = new Text('foo');
      assert.strictEqual(text.codetext, 'foo');
    });

    it('uses original text if no translation found', () => {
      const text = new Text('corgi');
      assert.strictEqual(text.text, 'corgi');
    });

    it('uses translation', () => {
      objects._dictionary = {tmnt: 'Teenage Mutant Ninja Turtles'};
      const text = new Text('tmnt');
      assert.strictEqual(text.text, 'Teenage Mutant Ninja Turtles');
    });

    it('picks a random element if translation is an array', () => {
      objects._dictionary = {tmnt: ['Teenage Mutant Ninja Turtles']};
      const text = new Text('tmnt');
      assert.strictEqual(text.text, 'Teenage Mutant Ninja Turtles');
    });
  });
});
