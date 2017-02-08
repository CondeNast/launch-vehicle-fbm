const EventEmitter = require('events');

const bodyParser = require('body-parser');
const Cacheman = require('cacheman');
const crypto = require('crypto');

const debug = require('debug')('messenger');
const logError = require('debug')('messenger:error');

const express = require('express');
const exphbs = require('express-handlebars');
const reqPromise = require('request-promise');
const urlJoin = require('url-join');

const conversationLogger = require('./conversationLogger');

const cache = new Cacheman('sessions');

const SESSION_TIMEOUT_MS = 3600 * 1000;  // 1 hour

const internals = {};


class Messenger extends EventEmitter {
  constructor(config, {hookPath = '/webhook', linkPath = '/link', emitGreetings = true} = {}) {
    super();

    this.config = config;

    this.options = {
      emitGreetings,
      hookPath,
      linkPath
    };

    this.app = express();
    this.app.engine('handlebars', exphbs({defaultLayout: 'main'}));
    this.app.set('view engine', 'handlebars');

    this.app.use(bodyParser.json({ verify: this.verifyRequestSignature.bind(this) }));
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(express.static('public'));

    this.greetings = /^(get started|good(morning|afternoon)|hello|hey|hi|hola|what's up)/i;

    // Facebook Messenger verification
    this.app.get(hookPath, (req, res) => {
      if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === this.config.get('messenger.validationToken')) {
        debug('Validating webhook');
        res.status(200).send(req.query['hub.challenge']);
      } else {
        debug('Failed validation. Make sure the validation tokens match.');
        res.sendStatus(403);
      }
    });

    this.app.post(hookPath, (req, res) => {
      const data = req.body;
      // `data` reference:
      // https://developers.facebook.com/docs/messenger-platform/webhook-reference#format
      if (data.object === 'page') {
        data.entry.forEach((pageEntry) => {
          pageEntry.messaging.forEach(this.routeEachMessage.bind(this));
        });
        res.sendStatus(200);
      }
    });

    this.app.post(linkPath, (req, res) => {
      this.onLink(req.body);
      res.sendStatus(200);
    });

    // App routes
    this.app.get('/login', (req, res) => res.render('login', {
      appId: this.config.get('facebook.appId'),
      serverUrl: this.config.get('serverUrl')
    }));
    this.app.get('/send-to-messenger', (req, res) => res.render('send-to-messenger', {
      appId: this.config.get('facebook.appId'),
      pageId: this.config.get('facebook.pageId')
    }));

    this.app.get('/', (req, res) => {
      res.send('👍');
    });

    this.app.get('/ping', (req, res) => {
      res.send('Departures healthcheck OK');
    });
  }

  start() {
    const port = this.config.get('port');
    this.app.listen(port, (err) => {
      if (err) throw err;
      debug('Server running on port %s', port);
      // TODO console.log(`Set your webhook to: `)
    });
  }

  routeEachMessage(messagingEvent) {
    const cacheKey = messagingEvent.sender.id;
    return cache.get(cacheKey)
      .then((session = {_key: cacheKey, count: 0}) => {
        // WISHLIST: logic to handle any thundering herd issues: https://en.wikipedia.org/wiki/Thundering_herd_problem
        if (session.profile) {
          return session;
        } else if (messagingEvent.sender.id === this.config.get('facebook.pageId')) {
          // The page does not have a public profile and calling the Graph API here will always yield a 400.
          session.profile = {};
          return session;
        } else {
          return this.getPublicProfile(messagingEvent.sender.id)
            .then((profile) => {
              session.profile = profile;
              return session;
            });
        }
      })
      .then((session) => {
        session.count++;
        if (session.source !== 'return' &&
            session.lastSeen &&
            // have to use `internals` here for testability
            new Date().getTime() - session.lastSeen > internals.SESSION_TIMEOUT_MS) {
          session.source = 'return';
        }
        session.lastSeen = new Date().getTime();
        if (messagingEvent.optin) {
          session.source = 'web';
          this.onAuth(messagingEvent, session);
        } else if (messagingEvent.message) {
          this.onMessage(messagingEvent, session);
        } else if (messagingEvent.delivery) {
          debug('incoming delivery event');
        } else if (messagingEvent.postback) {
          this.onPostback(messagingEvent, session);
        } else if (messagingEvent.read) {
          debug('incoming read event');
        } else {
          debug('incoming unknown messagingEvent: %o', messagingEvent);
        }
        return session;
      })
      .then((session) => this.saveSession(session));
  }

  doLogin(senderId) {
    // Open question: is building the event object worth it for the 'emit'?
    const event = {
      sender: {id: senderId},
      recipient: {id: this.config.get('facebook.pageId')},
      timestamp: new Date().getTime()
    };
    this.emit('login', {event, senderId});
    debug('doLogin request for user:%d', senderId);

    const messageData = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [{
            title: 'Login With Facebook',
            subtitle: '',
            buttons: [{
              type: 'web_url',
              url: urlJoin(this.config.get('serverUrl'), `login?userId=${senderId}`),
              title: 'Login With Facebook'
            }]
          }]
        }
      }
    };
    this.send(senderId, messageData);
  }

  getPublicProfile(senderId) {
    const options = {
      json: true,
      qs: {
        access_token: this.config.get('messenger.pageAccessToken'),
        fields: 'first_name,last_name,profile_pic,locale,timezone,gender'
      },
      url: `https://graph.facebook.com/v2.6/${senderId}`
    };
    return reqPromise.get(options)
      .catch((err) => {
        logError('Failed calling Graph API', err.message);
        return {};
      });
  }

  // EVENTS
  /////////

  onAuth(event, session) {
    const senderId = event.sender.id;
    // The 'ref' is the data passed through the 'Send to Messenger' call
    const optinRef = event.optin.ref;
    this.emit('auth', {event, senderId, session, optinRef});
    debug('onAuth for user:%d with param: %j', senderId, optinRef);
  }

  /*
    This is not an event triggered by Messenger, it is the post-back from the
    static Facebook login page that is made to look similar to an 'event'
  */
  onLink(event) {
    const senderId = event.sender.id;
    const fbData = event.facebook;
    debug('onlink for user:%d with data: %o', senderId, fbData);
    this.emit('link', {event, senderId, fbData});
    return;
  }

  onMessage(event, session) {
    const senderId = event.sender.id;
    const {message} = event;

    this.emit('message', {event, senderId, session, message});
    debug('onMessage from user:%d with message: %j', senderId, message);

    const {
      metadata,
      quick_reply: quickReply,
      // You may get text or attachments but not both
      text,
      attachments
    } = message;

    if (message.is_echo) {
      // Requires enabling `message_echoes` in your webhook, which is not the default
      // https://developers.facebook.com/docs/messenger-platform/webhook-reference#setup
      debug('message.echo metadata: %s', metadata);
      return;
    }

    if (this.options.emitGreetings && this.greetings.test(text)) {
      this.emit('message.greeting', {event, senderId, session});
      return;
    }

    if (quickReply) {
      debug('message.quickReply payload: "%s"', quickReply.payload);
      this.emit('message.quickReply', {event, senderId, session, payload: quickReply.payload});
      return;
    }

    if (text) {
      debug('message.text user:%d text: "%s" count: %s seq: %s',
        senderId, text, session.count, message.seq);
      this.emit('message.text', {event, senderId, session, text});
      return;
    }

    if (attachments) {
      // Currently, we can assume there is only one attachment in a message
      const attachment = attachments[0];
      let type = attachment.type;

      if (message.sticker_id) {
        // There's a special thumbsup button in the interface that comes in like a sticker
        // This magic number is intentional.
        type = (message.sticker_id === 369239263222822) ? 'thumbsup' : 'sticker';
      }

      this.emit(`message.${type}`, {event, senderId, session, attachment, url: attachment.payload.url});
      return;
    }
  }

  onPostback(event, session) {
    const senderId = event.sender.id;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    const payload = event.postback.payload;

    debug("onPostback for user:%d with payload '%s'", senderId, payload);

    this.emit('postback', {event, senderId, session, payload});
  }

  // HELPERS
  //////////

  saveSession(session) {
    return cache.set(session._key, session);
  }

  send(recipientId, messageData) {
    const options = {
      uri: 'https://graph.facebook.com/v2.8/me/messages',
      qs: { access_token: this.config.get('messenger.pageAccessToken') },
      json: {
        dashbotTemplateId: 'right',
        recipient: {
          id: recipientId
        },
        message: messageData
      }
    };
    debug('message.send: %j', options);

    return reqPromise.post(options)
      .then((jsonObj) => {
        if (this.dashbotClient) {
          // TODO should we strip pageAccessToken before giving it to dashbotClient?
          this.dashbotClient.logOutgoing(options, jsonObj);
        }
        conversationLogger.logOutgoing(options, jsonObj);
        const {recipient_id: recipientId, message_id: messageId} = jsonObj;
        debug('message.send:SUCCESS message id: %s to user:%d', messageId, recipientId);
      })
      .catch((err) => {
        logError('message.send:FAIL user:%d error: %s', recipientId, err);
      });
  }

  verifyRequestSignature(req, res, buf) {
    const signature = req.headers['x-hub-signature'];

    if (!signature) {
      throw new Error(`Couldn't validate the signature with app secret: ${this.config.get('messenger.appSecret')}`);
    }

    const [method, signatureHash] = signature.split('=');
    // TODO assert method === 'sha1'
    const expectedHash = crypto.createHmac(method, this.config.get('messenger.appSecret')).update(buf).digest('hex');

    if (signatureHash !== expectedHash) {
      throw new Error(`Couldn't validate the request signature: ${this.config.get('messenger.appSecret')}`);
    }
  }
}

internals.cache = cache;
internals.SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MS;
exports.__internals__ = internals;
exports.Messenger = Messenger;
