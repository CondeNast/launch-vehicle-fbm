const assert = require('assert');
const chai = require('chai');
const chaiHttp = require('chai-http');
const config = require('config');
const sinon = require('sinon');

const app = require('../../src/messenger/app');

chai.use(chaiHttp);

describe('app', () => {
  const messenger = new app.Messenger(config);

  beforeEach(() => {
    sinon.stub(messenger, 'send');
  });

  afterEach(() => {
    messenger.send.restore();
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


  describe('onAuth', function () {
    this.timeout(100);
    const baseEvent = {
      sender: {id: 'senderId'},
      recipient: {id: 'recipientId'},
      timestamp: 0,
      optin: {ref: ''}
    };

    it('emits auth event', () => {
      messenger.once('auth', (payload) => {
        assert.ok(payload.event);
        assert.ok(payload.session);
        assert.equal(payload.senderId, 'senderId');
        assert.equal(payload.optinRef, 'narf');
      });
      const event = Object.assign({}, baseEvent, {
        optin: {
          ref: 'narf'
        }
      });

      messenger.onAuth(event, {});

      assert.equal(messenger.send.callCount, 0);
    });
  });

  describe('onLink', function () {
    this.timeout(100);
    const baseEvent = {
      sender: {id: 'senderId'},
      recipient: {id: 'recipientId'},
      timestamp: 0,
      facebook: {id: ''}
    };

    it('emits link event', () => {
      messenger.once('link', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
        assert.equal(payload.fbData.id, 'narf');
      });
      const event = Object.assign({}, baseEvent, {
        facebook: {
          id: 'narf'
        }
      });

      messenger.onLink(event);

      assert.equal(messenger.send.callCount, 2);
    });
  });

  describe('onMessage message router', function () {
    this.timeout(100);
    const baseEvent = {
      sender: {id: 'senderId'},
      recipient: {id: 'recipientId'},
      timestamp: 0,
      message: {}
    };

    it('emits "message" event', () => {
      messenger.once('message', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
        assert.deepEqual(payload.message, {foo: 'bar'});
      });
      const event = Object.assign({}, baseEvent, {
        message: {foo: 'bar'}
      });

      messenger.onMessage(event);
    });

    it('emits "text" event', () => {
      messenger.once('message.text', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
        assert.equal(payload.text, 'message text');
      });
      const event = Object.assign({}, baseEvent, {
        message: {
          text: 'message text'
        }
      });

      messenger.onMessage(event);
    });

    it('emits "quick reply" event', () => {
      const messageText = 'Browse other looks';
      const quickReplyPayload = 'looks';
      messenger.once('message.quickReply', (quickReply) => {
        assert.ok(quickReply.event);
        assert.equal(quickReply.senderId, 'senderId');
        assert.equal(quickReply.payload, quickReplyPayload);
      });
      const event = Object.assign({}, baseEvent, {
        message: {
          quick_reply: { payload: quickReplyPayload },
          text: messageText
        }
      });

      messenger.onMessage(event);
    });


    it('emits "image" event', () => {
      messenger.once('message.image', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
        assert.equal(payload.url, 'http://i.imgur.com/w1F7dae.jpg');
      });
      const event = Object.assign({}, baseEvent, {
        message: {
          attachments: [
            {
              type: 'image',
              payload: {
                url: 'http://i.imgur.com/w1F7dae.jpg'
              }
            }
          ]
        }
      });

      messenger.onMessage(event);
    });

    it('emits "sticker" event', () => {
      messenger.once('message.sticker', () => {});
      const event = Object.assign({}, baseEvent, {
        message: {
          sticker_id: 201013950048539,
          attachments: [
            {
              type: 'image',
              payload: {
                url: 'https://scontent.xx.fbcdn.net/t39.1997-6/p100x100/851576_201013953381872_1273966384_n.png?_nc_ad=z-m',
                sticker_id: 201013950048539
              }
            }
          ]
        }
      });

      messenger.onMessage(event);
    });

    it('emits "thumbsup" event', () => {
      messenger.once('message.thumbsup', (payload) => {
        assert.equal(payload.senderId, 'senderId');
      });
      const event = Object.assign({}, baseEvent, {
        message: {
          sticker_id: 369239263222822,
          attachments: [
            {
              type: 'image',
              payload: {
                url: 'https://scontent.xx.fbcdn.net/t39.1997-6/851557_369239266556155_759568595_n.png?_nc_ad=z-m',
                sticker_id: 369239263222822
              }
            }
          ]
        }
      });

      messenger.onMessage(event);
    });
  });

  describe('onPostback', function () {
    this.timeout(100);
    const baseEvent = {
      sender: {id: 'senderId'},
      recipient: {id: 'recipientId'},
      timestamp: 0,
      postback: {payload: ''}
    };

    it('emits postback event', () => {
      messenger.once('postback', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
        assert.equal(payload.payload, 'narf');
      });
      const event = Object.assign({}, baseEvent, {
        postback: {
          payload: 'narf'
        }
      });

      messenger.onPostback(event);
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

    it('provides a Send to Messenger button', (done) => {
      chai.request(messenger.app)
        .get('/send-to-messenger')
        .end(function (err, res) {
          assert.equal(res.statusCode, 200);
          assert.ok(res.text.includes('fb-send-to-messenger'));
          done();
        });
    });

    it('provides a Message Us button', (done) => {
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
        .then(() => app.__internals__.cache.get(baseMessage.sender.id))
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
          return app.__internals__.cache.set(baseMessage.sender.id, session);
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
