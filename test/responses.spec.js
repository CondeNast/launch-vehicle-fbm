const assert = require('assert');
const path = require('path');

const appRootDir = require('app-root-dir');
const sinon = require('sinon');

const responses = require('../src/responses');
const Text = responses.Text;


describe('Responses', () => {
  let originalDictionary;

  before(() => {
    originalDictionary = responses._dictionary;
  });

  after(() => {
    responses._dictionary = originalDictionary;
  });

  describe('dictionary', () => {
    it('loads an empty dictionary when messages are not found', () => {
      assert.deepEqual(responses._dictionary, {});
    });

    it('loads a dictionary', () => {
      const responsesRef = Object.keys(require.cache).find((x) => x.endsWith('/src/responses.js'));
      delete require.cache[responsesRef];
      sinon.stub(appRootDir, 'get').returns(path.resolve(path.join(__dirname, './fixtures')));

      const dictionary = require('../src/responses')._dictionary;

      assert.equal(dictionary.greeting_msg, 'Hello World!');

      delete require.cache[responsesRef];
      appRootDir.get.restore();
    });
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
      responses._dictionary = {tmnt: 'Teenage Mutant Ninja Turtles'};
      const text = new Text('tmnt');
      assert.strictEqual(text.text, 'Teenage Mutant Ninja Turtles');
    });

    it('picks a random element if translation is an array', () => {
      responses._dictionary = {tmnt: ['Teenage Mutant Ninja Turtles']};
      const text = new Text('tmnt');
      assert.strictEqual(text.text, 'Teenage Mutant Ninja Turtles');
    });
  });
});
