const expect = require('chai').expect;
const nodeConfig = require('config');
const sinon = require('sinon');

const config = require('../src/config');

const random = function () {
  return Math.round(Math.random() * 100);
};

describe('config', () => {
  describe('config', () => {
    it('is the raw node-config module', () => {
      expect(config.config).to.deep.equal(nodeConfig);
    });
  });

  describe('get', () => {
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should respond with value inside launch-vehicle-fbm namespace', () => {
      let someArg = `foo-${random()}`;
      let stubConfig = sandbox.mock(nodeConfig);
      stubConfig
        .expects('get')
        .withArgs(`launch-vehicle-fbm.${someArg}`)
        .returns(`some return ${someArg}`);

      expect(config.get(someArg)).to.equal(`some return ${someArg}`);
      stubConfig.verify();
    });

    it('should respond with value outside of namespace with second param', () => {
      let someArg = `foo-${random()}`;
      let stubConfig = sandbox.mock(nodeConfig);
      stubConfig
        .expects('get')
        .withArgs(`${someArg}`)
        .returns(`some return ${someArg}`);

      expect(config.get(someArg, false)).to.equal(`some return ${someArg}`);
      stubConfig.verify();
    });
  });
});
