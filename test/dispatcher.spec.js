const assert = require('assert');
const sinon = require('sinon');

const app = require('../src/app');
const dispatcher = require('../src/dispatcher');

describe('dispatcher', () => {
  const messenger = new app.Messenger();
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
  });

  describe('register', () => {
    it('should register itself to handle message-received events');
  });

  describe('__internals__', () => {

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

        dispatcher.__internals__.onAuth(messenger, event, {});

        assert.equal(messenger.send.callCount, 0);
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

        dispatcher.__internals__.onMessage(messenger, event);
      });

      it('emits "text" event', () => {
        const event = Object.assign({}, baseEvent, {
          message: {
            text: 'message text'
          }
        });
        const fakeSession = {};
        messenger.once('text', (payload) => {
          assert.ok(payload.event);
          assert.equal(payload.senderId, 'senderId');
          assert.equal(payload.source, 'text');
          assert.equal(payload.text, 'message text');
        });

        dispatcher.__internals__.onMessage(messenger, event, fakeSession);
      });

      it('emits "quick reply" event', () => {
        const messageText = 'Text message test';
        const quickReplyPayload = 'quick-reply-payload';
        messenger.once('text', (quickReply) => {
          assert.ok(quickReply.event);
          assert.equal(quickReply.senderId, 'senderId');
          assert.equal(quickReply.source, 'quickReply');
          assert.equal(quickReply.text, quickReplyPayload);
        });
        const event = Object.assign({}, baseEvent, {
          message: {
            quick_reply: { payload: quickReplyPayload },
            text: messageText
          }
        });

        dispatcher.__internals__.onMessage(messenger, event, {});
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

        dispatcher.__internals__.onMessage(messenger, event);
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

        dispatcher.__internals__.onMessage(messenger, event);
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

        dispatcher.__internals__.onMessage(messenger, event);
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

        dispatcher.__internals__.onMessage(messenger, event, session);
      });

      it('emits "greeting" event when provided a pattern', () => {
        const myMessenger = new app.Messenger({emitGreetings: /^olleh/i});
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

        dispatcher.__internals__.onMessage(myMessenger, event, session);
      });

      it('emits "text" event for greeting when emitGreetings is disabled', () => {
        const myMessenger = new app.Messenger({emitGreetings: false});
        console.log(myMessenger.options);
        sinon.stub(myMessenger, 'send');

        const text = "hello, is it me you're looking for?";
        const event = Object.assign({}, baseEvent, {
          message: { text: text }
        });
        myMessenger.once('text.greeting', (payload) => {
          // console.log(JSON.stringify(payload));
          assert.fail('text', 'text.greeting', 'incorrect event emitted');
        });

        myMessenger.once('text', (payload) => {
          assert.ok(payload.event);
          assert.equal(payload.senderId, 'senderId');
        });

        dispatcher.__internals__.onMessage(myMessenger, event, session);
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

        dispatcher.__internals__.onMessage(messenger, event, {});
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
        messenger.once('text', (payload) => {
          assert.ok(payload.event);
          assert.equal(payload.senderId, 'senderId');
          assert.equal(payload.source, 'postback');
          assert.equal(payload.text, 'narf');
        });
        const event = Object.assign({}, baseEvent, {
          postback: {
            payload: 'narf'
          }
        });

        dispatcher.__internals__.onPostback(messenger, event);
      });
    });

  });

});
