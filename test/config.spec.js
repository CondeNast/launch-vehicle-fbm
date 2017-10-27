const assert = require('assert');

const nodeConfig = require('config');

const config = require('../src/config');

describe('config', () => {
  it('should be an instance of node-config with launch-vehicle-fbm', () => {
    // sanity check
    assert.ok(nodeConfig.get('launch-vehicle-fbm'));

    // actual test
    assert.deepEqual(config, nodeConfig.get('launch-vehicle-fbm'));
  });
});
