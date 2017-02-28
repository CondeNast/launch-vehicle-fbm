const assert = require('assert');

const main = require('..');


describe('main', () => {
  it('publicly exposes things', () => {
    assert.equal(typeof main.Messenger, 'function');
    assert.equal(typeof main.responses, 'object');
    assert.equal(typeof main.Text, 'function');
    assert.equal(typeof main.responses.Text, 'function');
  });
});
