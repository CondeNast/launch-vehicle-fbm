const expect = require('chai').expect;
const nodeConfig = require('config');
const sinon = require('sinon');

const config = require('../src/config');

const random = function () {
  return Math.round(Math.random() * 100);
};

describe('config', () => {
  it('should be an instance of node-config with launch-vehicle-fbm', () => {
    // sanity check
    expect(nodeConfig.get('launch-vehicle-fbm')).to.not.be.empty;

    // actual test
    expect(config).to.deep.equal(nodeConfig.get('launch-vehicle-fbm'));
  });
});
