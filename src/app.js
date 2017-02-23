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

const config = require('./config');
const conversationLogger = require('./conversationLogger');
const dispatcher = require('./dispatcher');
const router = require('./router');

const cache = new Cacheman('sessions');

const SESSION_TIMEOUT_MS = 3600 * 1000;  // 1 hour

const internals = {};

const DEFAULT_GREETINGS_REGEX = /^(get started|good(morning|afternoon)|hello|hey|hi|hola|what's up)/i;
const DEFAULT_HELP_REGEX = /^help\b/i;

// TODO Extract this class into `index` and refactor `App` to be only the
//      Express configuration and set up.
class Messenger extends EventEmitter {
  /*:: options: Object */
  /*:: app: Object */
  /*:: greetings: RegExp */
  constructor({hookPath = '/webhook', linkPath = '/link', emitGreetings = true} = {}) {
    super();

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

    router.init(this);

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
      req.query['hub.verify_token'] === config.get('messenger.validationToken')) {
        debug('Validating webhook');
        res.status(200).send(req.query['hub.challenge']);
      } else {
        debug('Failed validation. Make sure the validation tokens match.');
        res.sendStatus(403);
      }
    });

    // TODO Make this emit `app.message`
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
      appId: config.get('facebook.appId'),
      serverUrl: config.get('serverUrl')
    }));
    this.app.get('/send-to-messenger', (req, res) => res.render('send-to-messenger', {
      appId: config.get('facebook.appId'),
      pageId: config.get('facebook.pageId')
    }));

    this.app.get('/', (req, res) => {
      res.send('👍');
    });

    this.app.get('/ping', (req, res) => {
      res.send('pong');
    });
  }

  start() {
    const port = config.get('port');
    this.app.listen(port, (err) => {
      if (err) throw err;
      debug('Server running on port %s', port);
      // TODO console.log(`Set your webhook to: `)
    });
  }

  routeEachMessage(messagingEvent/*: Object */) {
    const cacheKey = this.getCacheKey(messagingEvent.sender.id);
    return cache.get(cacheKey)
      .then(this.loadProfile(messagingEvent, {_key: cacheKey, count: 0}))
      .then(this.updateLastSeen)
      .then((session) => {
        dispatcher.emit('app.session.ready', {messagingEvent, session});
        return session;
      })
      // TODO: save session based on a dispatcher event for session changes
      .then((session) => this.saveSession(session));
  }

  loadProfile(messagingEvent, defaultSession) {
    return (session = defaultSession) => {
      // WISHLIST: logic to handle any thundering herd issues: https://en.wikipedia.org/wiki/Thundering_herd_problem
      if (session.profile) {
        return session;
      } else if (messagingEvent.sender.id === config.get('facebook.pageId')) {
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
    };
  }

  updateLastSeen(session)  {
    session.count++;
    if (session.source !== 'return' &&
        session.lastSeen &&
        // have to use `internals` here for testability
        new Date().getTime() - session.lastSeen > internals.SESSION_TIMEOUT_MS) {
      session.source = 'return';
    }
    session.lastSeen = new Date().getTime();

    return session;
  }


  doLogin(senderId/*: number */) {
    // Open question: is building the event object worth it for the 'emit'?
    const event = {
      sender: {id: senderId},
      recipient: {id: config.get('facebook.pageId')},
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
              url: urlJoin(config.get('serverUrl'), `login?userId=${senderId}`),
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
        access_token: config.get('messenger.pageAccessToken'),
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

  // HELPERS
  //////////

  getCacheKey(senderId/*: number */) {
    return `${config.get('facebook.appId')}-${senderId}`;
  }

  saveSession(session/*: Object */) {
    return cache.set(session._key, session);
  }

  send(recipientId/*: number */, messageData/*: Object */) {
    const options = {
      uri: 'https://graph.facebook.com/v2.8/me/messages',
      qs: { access_token: config.get('messenger.pageAccessToken') },
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
      throw new Error(`Couldn't validate the signature with app secret: ${config.get('messenger.appSecret')}`);
    }

    const [method, signatureHash] = signature.split('=');
    // TODO assert method === 'sha1'
    const expectedHash = crypto.createHmac(method, config.get('messenger.appSecret')).update(buf).digest('hex');

    if (signatureHash !== expectedHash) {
      throw new Error(`Couldn't validate the request signature: ${config.get('messenger.appSecret')}`);
    }
  }
}

internals.cache = cache;
internals.SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MS;
exports.__internals__ = internals;
exports.Messenger = Messenger;
