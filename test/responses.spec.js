const assert = require('assert');
const path = require('path');

const appRootDir = require('app-root-dir');
const sinon = require('sinon');

const responses = require('../src/responses');
const Text = responses.Text;


describe('Responses', () => {
  let originalDictionary;
  let sandbox;

  beforeEach(() => {
    originalDictionary = responses._dictionary;
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    responses._dictionary = originalDictionary;
    sandbox.restore();
  });

  describe('dictionary', () => {
    it('loads an empty dictionary when messages are not found', () => {
      assert.deepEqual(responses._dictionary, {});
    });

    it('loads a dictionary', () => {
      const responsesRef = Object.keys(require.cache).find((x) => x.endsWith('/src/responses.js'));
      delete require.cache[responsesRef];
      sandbox.stub(appRootDir, 'get').returns(path.resolve(path.join(__dirname, './fixtures')));

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

    it('supports printf formatting', () => {
      responses._dictionary = {'tmn%s': 'Teenage Mutant Ninja %s'};
      const text = new Text('tmn%s', 'Turtles');
      assert.strictEqual(text.text, 'Teenage Mutant Ninja Turtles');
    });

    it('supports printf formatting with obfuscated format string', () => {
      responses._dictionary = {tmnt: 'Teenage Mutant Ninja %s'};
      const text = new Text('tmnt', 'Turtles');
      assert.strictEqual(text.text, 'Teenage Mutant Ninja Turtles');
    });

    it('supports printf formatting when dictionary entry missing', () => {
      responses._dictionary = {};
      const text = new Text('tmn%s', 'Turtles');
      assert.strictEqual(text.text, 'tmnTurtles');
    });

    it('concatenates additional arguments', () => {
      responses._dictionary = {};
      const text = new Text('tmn', 'Turtles');
      assert.strictEqual(text.text, 'tmn Turtles');
    });
  });
});
