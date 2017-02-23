const assert = require('assert');
const chai = require('chai');
const chaiHttp = require('chai-http');
const config = require('config');
const reqPromise = require('request-promise');
const sinon = require('sinon');

const app = require('../src/app');
const dispatcher = require('../src/dispatcher');

chai.use(chaiHttp);

describe('app', () => {
  const messenger = new app.Messenger(config);
  let session;

  beforeEach(() => {
    sinon.stub(messenger, 'send');
    session = {
      profile: {
        first_name: '  Guy  ',
        last_name: '  Hoozdis  '
      }
    };
  });

  afterEach(() => {
    // TODO investigate making the suite mock `reqPromise.post` instead of `send`
    messenger.send.restore && messenger.send.restore();
    dispatcher.removeAllListeners();
  });


  describe('doLogin', function () {
    this.timeout(100);
    it('emits login event', () => {
      messenger.once('login', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'narf');
      });

      messenger.doLogin('narf');

      assert.equal(messenger.send.callCount, 1);
    });
  });

  describe('send', function () {
    let postStub;

    beforeEach(() => {
      postStub = sinon.stub(reqPromise, 'post').returns(Promise.resolve({}));
    });

    afterEach(() => {
      postStub.restore();
    });

    it('passed sender id and message', () => {
      messenger.send.restore();

      return messenger.send('senderId', {foo: 'bar'})
        .then(() => {
          assert.equal(reqPromise.post.args[0][0].json.recipient.id, 'senderId');
          assert.deepEqual(reqPromise.post.args[0][0].json.message, {foo: 'bar'});
        });
    });
  });

  describe('staticContent', function () {
    it('provides a homepage', (done) => {
      chai.request(messenger.app)
        .get('/')
        .end(function (err, res) {
          assert.equal(res.statusCode, 200);
          done();
        });
    });

    xit('provides a Send to Messenger button', (done) => {
      chai.request(messenger.app)
        .get('/send-to-messenger')
        .end(function (err, res) {
          assert.equal(res.statusCode, 200);
          assert.ok(res.text.includes('fb-send-to-messenger'));
          done();
        });
    });

    xit('provides a Message Us button', (done) => {
      chai.request(messenger.app)
        .get('/send-to-messenger')
        .end(function (err, res) {
          assert.equal(res.statusCode, 200);
          assert.ok(res.text.includes('fb-messengermessageus'));
          done();
        });
    });

    it('provides a departures healthcheck', (done) => {
      chai.request(messenger.app)
        .get('/ping')
        .end(function (err, res) {
          assert.equal(res.statusCode, 200);
          done();
        });
    });

  });

  describe('routeEachMessage session', () => {
    const baseMessage = {
      sender: {id: 'teehee'}
    };
    let messenger;

    beforeEach(() => {
      messenger = new app.Messenger(config);
      sinon.stub(messenger, 'getPublicProfile').returns({then: (resolve) => resolve({})});
    });

    afterEach(() => {
      messenger.getPublicProfile.restore();
    });

    it('counts every message received', () =>
      messenger.routeEachMessage(baseMessage)
        .then(() => messenger.routeEachMessage(baseMessage))
        .then((session) => {
          assert.equal(session.count, 2);
        })
    );

    it('sets lastSeen', () =>
      messenger.routeEachMessage(baseMessage)
        .then((session) => {
          assert.equal(typeof session.lastSeen, 'number');
        })
    );

    it('sets source for auth messages', () => {
      const authMessage = Object.assign({optin: 'foo'}, baseMessage);
      return messenger.routeEachMessage(authMessage)
        .then(() => app.__internals__.cache.get(messenger.getCacheKey(baseMessage.sender.id)))
        .then((session) => {
          assert.equal(session.source, 'web');
        });
    });

    describe('return user', () => {
      let originalValue;

      before(() => {
        originalValue = app.__internals__.SESSION_TIMEOUT_MS;
        app.__internals__.SESSION_TIMEOUT_MS = 0;
      });

      after(() => {
        app.__internals__.SESSION_TIMEOUT_MS = originalValue;
      });

      it('sets source for return user', () =>
        messenger.routeEachMessage(baseMessage)
          .then((session) => {
            session.source = 'foo';
            return messenger.routeEachMessage(baseMessage);
          })
          .then((session) => {
            assert.equal(session.source, 'return');
          })
      );
    });

    it('does not set source for user still in session', () =>
      messenger.routeEachMessage(baseMessage)
        .then((session) => {
          session.source = 'foo this should not change';
          return app.__internals__.cache.set(messenger.getCacheKey(baseMessage.sender.id), session);
        })
        .then(() => {
          return messenger.routeEachMessage(baseMessage);
        })
        .then((session) => {
          assert.equal(session.source, 'foo this should not change');
        })
    );
  });
});
