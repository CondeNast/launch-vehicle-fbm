const assert = require('assert');
const Cacheman = require('cacheman');
const chai = require('chai');
const chaiHttp = require('chai-http');
const reqPromise = require('request-promise');
const sinon = require('sinon');

const { Messenger, Response } = require('../src/app');
const config = require('../src/config');

chai.use(chaiHttp);

describe('app', () => {
  let messenger;
  let session;

  before(() => {
    messenger = new Messenger();
  });

  beforeEach(() => {
    sinon.stub(messenger, 'pageSend').resolves({});
    session = {
      profile: {
        first_name: '  Guy  ',
        last_name: '  Hoozdis  '
      }
    };
  });

  afterEach(() => {
    // TODO investigate making the suite mock `reqPromise.post` instead of `send`
    messenger.pageSend.restore && messenger.pageSend.restore();
  });

  describe('Response', () => {
    let options;

    beforeEach(() => {
      options = {
        senderId: 1234,
        session
      };
    });

    it('constructs', () => {
      const response = new Response(messenger, options);
      assert.ok(response);
    });

    it('throws when passed an object without "senderId"', () => {
      try {
        delete options.senderId;
        new Response(messenger, options);
        assert.ok(false, 'This path should not run');
      } catch (err) {
        assert.ok(err);
      }
    });

    it('throws when passed an object without "senderId"', () => {
      try {
        delete options.session;
        new Response(messenger, options);
        assert.ok(false, 'This path should not run');
      } catch (err) {
        assert.ok(err);
      }
    });

    it('reply calls .pageSend', () => {
      options.session._pageId = 1337;
      const response = new Response(messenger, options);

      response.reply('message back to user');

      const args = messenger.pageSend.args[0];
      assert.equal(args[0], options.session._pageId);
      assert.equal(args[1], options.senderId);
      assert.equal(args[2], 'message back to user');
    });

    it('reply calls .pageSend when called without context', () => {
      options.session._pageId = 1337;
      const { reply } = new Response(messenger, options);

      reply('message back to user');

      const args = messenger.pageSend.args[0];
      assert.equal(args[0], options.session._pageId);
      assert.equal(args[1], options.senderId);
      assert.equal(args[2], 'message back to user');
    });
  });

  describe('constructor', () => {
    it('can use a supplied cache instead of the default', () => {
      const fakeCache = {};
      const messenger = new Messenger({cache: fakeCache});
      assert.strictEqual(messenger.cache, fakeCache);
    });

    it('sets .pages based on config if none supplied', () => {
      const messenger = new Messenger();
      // based on fixture in `test.env`
      assert.strictEqual(messenger.pages[1029384756], 'ThatsAReallyLongStringYouGotThere');
    });

    it('sets .pages based on options', () => {
      const messenger = new Messenger({pages: {1337: '1337accesstoken'}});
      assert.strictEqual(messenger.pages[1337], '1337accesstoken');
    });

    it('allows you to not pass in pages config at all', () => {
      const originalpageId = config.facebook.pageId;
      delete config.facebook.pageId;

      const messenger = new Messenger();

      assert.deepEqual(messenger.pages, {});

      config.facebook.pageId = originalpageId;
    });
  });

  describe('start', () => {
    beforeEach(() => {
      sinon.stub(messenger.app, 'listen');
    });

    afterEach(() => {
      messenger.app.listen.restore();
    });

    it('emits a "starting" event', (done) => {
      messenger.once('app.starting', (payload) => {
        assert.ok(payload.port);
        done();
      });

      messenger.start();
    });
  });

  describe('doLogin', function () {
    this.timeout(100);
    it('emits login event', () => {
      messenger.once('login', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'narf');
      });

      messenger.doLogin('narf');

      assert.equal(messenger.pageSend.callCount, 1);
    });
  });

  describe('getPublicProfile', () => {
    it('gets public profile with deprecated arguments', () => {
      return messenger.getPublicProfile(12345)
        .then((profile) => {
          assert.ok(profile);
        });
    });

    it('gets public profile', () => {
      const myMessenger = new Messenger({pages: {1337: '1337accesstoken'}});
      return myMessenger.getPublicProfile(12345, 1337)
        .then((profile) => {
          assert.ok(profile);
        });
    });

    it('throws if messenger is missing page configuration', () => {
      try {
        messenger.getPublicProfile(12345, 1337);
        assert.ok(false, 'This path should not execute');
      } catch (err) {
        assert.equal(err.message.substr(0, 19), 'Missing page config');
      }
    });

    it('gets public profile with missing page configuration with 1page config', () => {
      return messenger.getPublicProfile(12345, 1029384756)  // from test.env
        .then((profile) => {
          assert.ok(profile);
        });
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

      messenger.onAuth(event, session);

      assert.equal(messenger.pageSend.callCount, 0);
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

      messenger.onMessage(event, session);
    });

    it('emits "text" event', () => {
      const messageText = 'Text message test';
      messenger.once('text', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
        assert.equal(payload.source, 'text');
        assert.equal(payload.text, messageText);
      });
      const event = Object.assign({}, baseEvent, {
        message: {
          text: messageText
        }
      });
      messenger.onMessage(event, session);
    });

    it('emits "quick reply" event', (done) => {
      const messageText = 'Text message test';
      const quickReplyPayload = ' QUICK-REPLY-PAYLOAD ';
      const normalizedPayload = quickReplyPayload.toLowerCase().trim();
      messenger.once('text', (quickReply) => {
        assert.ok(quickReply.event);
        assert.equal(quickReply.senderId, 'senderId');
        assert.equal(quickReply.source, 'quickReply');
        assert.equal(quickReply.text, quickReplyPayload);
        assert.equal(quickReply.normalizedText, normalizedPayload);
        done();
      });
      const event = Object.assign({}, baseEvent, {
        message: {
          quick_reply: { payload: quickReplyPayload },
          text: messageText
        }
      });

      messenger.onMessage(event, session);
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

      messenger.onMessage(event, session);
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

      messenger.onMessage(event, session);
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

      messenger.onMessage(event, session);
    });

    it('emits "greeting" event', () => {
      const text = "hello, is it me you're looking for?";
      const event = Object.assign({}, baseEvent, { message: { text: text } });
      messenger.once('text.greeting', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');

        assert.ok(payload.firstName);
        assert.ok(payload.surName);
        assert.ok(payload.fullName);
      });

      messenger.once('message.text', () => {
        assert.fail('message.text', 'text.greeting', 'incorrect event emitted');
      });

      messenger.onMessage(event, session);
    });

    it('emits "greeting" event when provided a pattern', () => {
      const myMessenger = new Messenger({emitGreetings: /^olleh/i});
      sinon.stub(myMessenger, 'send');

      const text = "olleh, it's just olleh, backwards";
      const event = Object.assign({}, baseEvent, { message: { text: text } });
      myMessenger.once('text.greeting', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
      });

      myMessenger.once('message.text', () => {
        assert.fail('message.text', 'text.greeting', 'incorrect event emitted');
      });

      myMessenger.onMessage(event, session);
    });

    it('emits "text" event for greeting when emitGreetings is disabled', () => {
      const myMessenger = new Messenger({emitGreetings: false});
      sinon.stub(myMessenger, 'send');

      const text = "hello, is it me you're looking for?";
      const event = Object.assign({}, baseEvent, {
        message: { text: text }
      });
      myMessenger.once('text.greeting', () => {
        assert.fail('text', 'text.greeting', 'incorrect event emitted');
      });

      myMessenger.once('text', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
      });

      myMessenger.onMessage(event, {});
    });

    it('emits "help" event', () => {
      const text = 'help me out';
      const event = Object.assign({}, baseEvent, { message: { text: text } });
      messenger.once('text.help', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
      });

      messenger.once('message.text', () => {
        assert.fail('message.text', 'text.help', 'incorrect event emitted');
      });

      messenger.onMessage(event, {});
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
      const testPayload = ' NARF ';
      const normalizedPayload = testPayload.toLowerCase().trim();
      messenger.once('text', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
        assert.equal(payload.source, 'postback');
        assert.equal(payload.text, testPayload);
        assert.equal(payload.normalizedText, normalizedPayload);
      });
      const event = Object.assign({}, baseEvent, {
        postback: {
          payload: testPayload
        }
      });

      messenger.onPostback(event, session);
    });

    it('emits "greeting" event from a postback', () => {
      messenger.once('text.greeting', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');

        assert.ok(payload.firstName);
        assert.ok(payload.surName);
        assert.ok(payload.fullName);
      });
      const event = Object.assign({}, baseEvent, {
        postback: {
          payload: 'hello'
        }
      });
      messenger.onPostback(event, session);
    });

    it('emits "help" event from a postback', () => {
      messenger.once('text.help', (payload) => {
        assert.ok(payload.event);
        assert.equal(payload.senderId, 'senderId');
      });
      const event = Object.assign({}, baseEvent, {
        postback: {
          payload: 'help'
        }
      });
      messenger.onPostback(event, session);
    });
  });

  describe('send', function () {
    let postStub;

    beforeEach(() => {
      messenger.pageSend.restore();
      postStub = sinon.stub(reqPromise, 'post').resolves({});
    });

    afterEach(() => {
      postStub.restore();
    });

    it('throws if messenger is missing page configuration', () => {
      try {
        messenger.pageSend(1337, 'senderId', {foo: 'bar'});
        assert.ok(false, 'This path should not execute');
      } catch (err) {
        assert.equal(err.message.substr(0, 19), 'Missing page config');
      }
    });

    it('passes sender id and message', () => {
      const myMessenger = new Messenger({pages: {1337: '1337accesstoken'}});
      return myMessenger.pageSend(1337, 'senderId', {foo: 'bar'})
        .then(() => {
          assert.equal(reqPromise.post.args[0][0].qs.access_token, '1337accesstoken');
          assert.equal(reqPromise.post.args[0][0].json.recipient.id, 'senderId');
          assert.deepEqual(reqPromise.post.args[0][0].json.message, {foo: 'bar'});
        });
    });

    it('passes sender id and message with deprecated arguments', () => {
      return messenger.send('senderId', {foo: 'bar'})
        .then(() => {
          assert.equal(reqPromise.post.args[0][0].json.recipient.id, 'senderId');
          assert.deepEqual(reqPromise.post.args[0][0].json.message, {foo: 'bar'});
        });
    });

    it('passes sender id and message with deprecated config', () => {
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

    it('provides a healthcheck at /ping', (done) => {
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
      messenger = new Messenger({cache: new Cacheman('test')});
      sinon.stub(messenger, 'getPublicProfile').resolves({});
    });

    afterEach(() => {
      messenger.getPublicProfile.restore();
    });

    it('uses default session if cache returns falsey', () => {
      const nullCache = {
        get() {
          return Promise.resolve(null);
        },
        set(key, data) {
          return Promise.resolve(data);
        }
      };
      messenger = new Messenger({cache: nullCache});
      sinon.stub(messenger, 'getPublicProfile').resolves({});

      return messenger.routeEachMessage(baseMessage)
        .then((session) => {
          assert.ok(session._key);
        });
    });

    it('sets _key', () =>
      messenger.routeEachMessage(baseMessage)
        .then((session) => {
          assert.ok(session._key);
        })
    );

    it('sets _pageId', () =>
      messenger.routeEachMessage(baseMessage, '12345')
        .then((session) => {
          assert.equal(session._pageId, '12345');
        })
    );

    it('counts every message received', () =>
      messenger.routeEachMessage(baseMessage)
        .then(() => messenger.routeEachMessage(baseMessage, '123'))
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
        .then(() => messenger.cache.get(messenger.getCacheKey(baseMessage.sender.id)))
        .then((session) => {
          assert.equal(session.source, 'web');
        });
    });

    describe('return user', () => {
      it('sets source for return user', () =>
        messenger.routeEachMessage(baseMessage)
          .then((session) => {
            session.source = 'foo';
            session.lastSeen = 1;
            return messenger.saveSession(session);
          })
          .then(() => messenger.routeEachMessage(baseMessage))
          .then((session) => {
            assert.equal(session.source, 'return');
          })
      );
    });

    it('does not set source for user still in session', () =>
      messenger.routeEachMessage(baseMessage)
        .then((session) => {
          session.source = 'foo this should not change';
          return messenger.cache.set(messenger.getCacheKey(baseMessage.sender.id), session);
        })
        .then(() => messenger.routeEachMessage(baseMessage))
        .then((session) => {
          assert.equal(session.source, 'foo this should not change');
        })
    );
  });

  describe('normalizeString', () => {
    it('returns a lowercase string with no leading or trailing whitespace', () => {
      const upperChars = /[A-Z]/;
      const whiteSpace = /(^\s)|(\s$)/;

      const testString = '  TEST StRiNg   ';
      assert.ok(upperChars.test(testString));
      assert.ok(whiteSpace.test(testString));

      const normalizedString = messenger.normalizeString(testString);
      assert.ok(!upperChars.test(normalizedString));
      assert.ok(!whiteSpace.test(normalizedString));
    });
  });
});
