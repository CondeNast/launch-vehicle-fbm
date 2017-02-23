const { expect } = require('chai');
const dispatcher = require('../src/dispatcher');

describe('dispatcher', () => {
  it('should provide an on function', () => {
    expect(dispatcher).to.have.property('on')
      .and.to.be.a('function');
  });

  it('should provide an emit function', () => {
    expect(dispatcher).to.have.property('on')
      .and.to.be.a('function');
  });

  it('should dispatch events when triggered', (done) => {
    dispatcher.on('some-event', () => {
      done();
    });
    dispatcher.emit('some-event');
  });
});
