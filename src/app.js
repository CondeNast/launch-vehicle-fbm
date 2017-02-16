// @flow
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
const dispatcher = require('./dispatcher');

const cache = new Cacheman('sessions');

const SESSION_TIMEOUT_MS = 3600 * 1000;  // 1 hour

const internals = {};

const DEFAULT_GREETINGS_REGEX = /^(get started|good(morning|afternoon)|hello|hey|hi|hola|what's up)/i;
const DEFAULT_HELP_REGEX = /^help\b/i;

class Messenger extends EventEmitter {
  /*:: config: Object */
  /*:: options: Object */
  /*:: app: Object */
  /*:: greetings: RegExp */
  constructor(config/*: Object */, {hookPath = '/webhook', linkPath = '/link', emitGreetings = true} = {}) {
    super();

    this.config = config;

    this.options = {
      hookPath,
      linkPath
    };

    if (emitGreetings instanceof RegExp) {
      this.greetings = emitGreetings;
    } else {
      this.greetings = DEFAULT_GREETINGS_REGEX;
    }
    this.options.emitGreetings = !!emitGreetings;

    this.app = express();
    this.app.engine('handlebars', exphbs({defaultLayout: 'main'}));
    this.app.set('view engine', 'handlebars');

    this.app.use(bodyParser.json({ verify: this.verifyRequestSignature.bind(this) }));
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(express.static('public'));

    this.help = DEFAULT_HELP_REGEX;

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
      conversationLogger.logIncoming(data);
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

    dispatcher.register(this);
  }

  start() {
    const port = this.config.get('port');
    this.app.listen(port, (err) => {
      if (err) throw err;
      debug('Server running on port %s', port);
      // TODO console.log(`Set your webhook to: `)
    });
  }

  routeEachMessage(messagingEvent/*: Object */) {
    const cacheKey = this.getCacheKey(messagingEvent.sender.id);
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
        this.emit('message-received', {message: messagingEvent, session});
        return session;
      })
      .then((session) => this.saveSession(session));
  }

  doLogin(senderId/*: number */) {
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

  getPublicProfile(senderId/*: number */) {
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

  /*
    This is not an event triggered by Messenger, it is the post-back from the
    static Facebook login page that is made to look similar to an 'event'
  */
  onLink(event) {
    const senderId = event.sender.id;
    const fbData = event.facebook;
    debug('onLink for user:%d with data: %o', senderId, fbData);
    this.emit('link', {event, senderId, fbData});
    return;
  }

  // HELPERS
  //////////

  getCacheKey(senderId/*: number */) {
    return `${this.config.get('facebook.appId')}-${senderId}`;
  }

  saveSession(session/*: Object */) {
    return cache.set(session._key, session);
  }

  send(recipientId/*: number */, messageData/*: Object */) {
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
