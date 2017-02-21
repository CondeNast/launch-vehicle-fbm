const assert = require('assert');
const path = require('path');

const appRootDir = require('app-root-dir');
const sinon = require('sinon');

const objects = require('../src/objects');
const Text = objects.Text;


describe('Messenger Objects', () => {
  let originalDictionary;

  before(() => {
    originalDictionary = objects._dictionary;
  });

  after(() => {
    objects._dictionary = originalDictionary;
  });

  describe('dictionary', () => {
    after(() => {
      appRootDir.get.restore && appRootDir.get.restore();
    });

    it('loads empty dictionary when messages are not found', () => {
      assert.deepEqual(objects._dictionary, {});
    });

    it('loads a dictionary', () => {
      const objectsRef = Object.keys(require.cache).find((x) => x.endsWith('/src/objects.js'));
      delete require.cache[objectsRef];
      sinon.stub(appRootDir, 'get').returns(path.resolve(path.join(__dirname, './fixtures')));

      const dictionary = require('../src/objects')._dictionary;

      assert.equal(dictionary.hi, 'Hello');
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
