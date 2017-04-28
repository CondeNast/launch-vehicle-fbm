// @flow weak
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
const { ConversationLogger } = require('./conversationLogger');


const SESSION_TIMEOUT_MS = 3600 * 1000;  // 1 hour

const DEFAULT_GREETINGS_REGEX = /^(get started|good(morning|afternoon)|hello|hey|hi|hola|what's up)/i;
const DEFAULT_HELP_REGEX = /^help\b/i;

/*:: type Session = {_pageId: string|number, count: number, profile: ?Object} */

class Response {
  /*:: _messenger: Messenger */
  /*:: senderId: string|number */
  /*:: session: Session */
  constructor(messenger/*: Messenger */, options/*: Object */) {
    Object.assign(this, options);
    ['senderId', 'session'].forEach((required) => {
      // $FlowFixMe
      if (!this[required]) {
        throw new Error(`Incomplete Response, missing ${required}: ${JSON.stringify(options)}`);
      }
    });
    this._messenger = messenger;
    // $FlowFixMe
    this.reply = this.reply.bind(this);
  }

  reply(response) {
    return this._messenger.pageSend(this.session._pageId, this.senderId, response);
  }
}

class Messenger extends EventEmitter {
  /*:: app: Object */
  /*:: cache: Object */
  /*:: conversationLogger: Object */
  /*:: greetings: RegExp */
  /*:: help: RegExp */
  /*:: options: Object */
  /*:: pages: Object */
  constructor({
      hookPath = '/webhook',
      linkPath = '/link',
      emitGreetings = true,
      cache,
      pages = {}
    } = {}) {
    super();

    this.conversationLogger = new ConversationLogger(config);

    if (emitGreetings instanceof RegExp) {
      this.greetings = emitGreetings;
    } else {
      this.greetings = DEFAULT_GREETINGS_REGEX;
    }

    this.options = {
      emitGreetings: !!emitGreetings,
      hookPath,
      linkPath
    };

    if (cache) {
      this.cache = cache;
    } else {
      this.cache = new Cacheman('sessions', {ttl: SESSION_TIMEOUT_MS / 1000});
    }

    if (pages && Object.keys(pages).length) {
      this.pages = pages;
    } else if (config.has('messenger.pageAccessToken') && config.has('facebook.pageId')) {
      this.pages = {[config.get('facebook.pageId')]: config.get('messenger.pageAccessToken')};
    } else {
      this.pages = {};
      debug("MISSING options.pages; you won't be able to reply or get profile information");
    }

    this.app = express();
    this.app.engine('handlebars', exphbs({defaultLayout: 'main'}));
    this.app.set('view engine', 'handlebars');

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

    this.app.post(hookPath, bodyParser.json({ verify: this.verifyRequestSignature.bind(this) }), (req, res) => {
      const data = req.body;
      this.conversationLogger.logIncoming(data);
      // `data` reference:
      // https://developers.facebook.com/docs/messenger-platform/webhook-reference#format
      if (data.object === 'page') {
        data.entry.forEach((pageEntry) => {
          pageEntry.messaging.forEach((x) => this.routeEachMessage(x, pageEntry.id));
        });
        res.sendStatus(200);
      }
    });

    this.app.post(linkPath, (req, res) => {
      this.onLink(req.body);
      res.sendStatus(200);
    });

    // App routes

    // Stub routes for future functionality
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
    this.emit('app.starting', {port});
    this.app.listen(port, (err) => {
      if (err) throw err;
      this.emit('app.started', {port});
      debug('Server running on: http://localhost:%s Set your webhook to: %s', port, urlJoin(config.get('serverUrl'), this.options.hookPath));
    });
  }

  routeEachMessage(messagingEvent/*: Object */, pageId/*: string */)/*: Promise<Session> */ {
    const cacheKey = this.getCacheKey(messagingEvent.sender.id);
    return this.cache.get(cacheKey)
      // The cacheman-redis backend returns `null` instead of `undefined`
      .then((cacheResult) => cacheResult || undefined)
      .then((session/*: Session */ = {_key: cacheKey, _pageId: pageId, count: 0, profile: null}) => {
        // WISHLIST: logic to handle any thundering herd issues: https://en.wikipedia.org/wiki/Thundering_herd_problem
        if (session.profile) {
          return session;
        } else if (messagingEvent.sender.id === pageId) {
          // The page does not have a public profile and calling the Graph API here will always yield a 400.
          session.profile = {};
          return session;
        }

        return this.getPublicProfile(messagingEvent.sender.id, pageId)
          .then((profile) => {
            session.profile = profile;
            return session;
          });
      })
      .then((session) => {
        session.count++;
        if (session.source !== 'return' &&
            session.lastSeen &&
            new Date().getTime() - session.lastSeen > exports.SESSION_TIMEOUT_MS) {
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

  // TODO flesh these out later
  doLogin(senderId/*: number */, pageId/*: string */) {
    // Open question: is building the event object worth it for the 'emit'?
    const event = {
      sender: {id: senderId},
      recipient: {id: pageId},
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
    this.pageSend(pageId, senderId, messageData);
  }

  getPublicProfile(senderId/*: number */, pageId/*: string|void */)/*: Promise<Object> */ {
    // TODO make `pageId` required, then simplify. `getPublicProfile` is only internal right now
    const pageAccessToken = this.pages[pageId || config.get('facebook.pageId')];
    if (!pageAccessToken) {
      throw new Error(`Missing page config for: ${pageId || ''}`);
    }
    const options = {
      json: true,
      qs: {
        access_token: pageAccessToken,
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

  onAuth(event, session/*: Session */) {
    const senderId = event.sender.id;
    // The 'ref' is the data passed through the 'Send to Messenger' call
    const optinRef = event.optin.ref;
    this.emit('auth', new Response(this, {event, senderId, session, optinRef}));
    debug('onAuth for user:%d with param: %j', senderId, optinRef);
  }

  /*
    This is not an event triggered by Messenger, it is the post-back from the
    static Facebook login page that is made to look similar to an 'event'
  */
  // TODO flesh these out later
  onLink(event) {
    const senderId = event.sender.id;
    const fbData = event.facebook;
    debug('onLink for user:%d with data: %o', senderId, fbData);
    this.emit('link', {event, senderId, fbData});
    return;
  }

  onMessage(event, session/*: Session */) {
    const senderId = event.sender.id;
    const {message} = event;

    this.emit('message', new Response(this, {event, senderId, session, message}));
    debug('onMessage from user:%d with message: %j', senderId, message);

    const {
      quick_reply: quickReply,
      // You may get text or attachments but not both
      text,
      attachments
    } = message;

    if (this.emitOptionalEvents(event, senderId, session, text)) {
      return;
    }

    if (quickReply) {
      const payload = quickReply.payload;
      debug('message.quickReply payload: "%s"', payload);
      this.emit('text', new Response(this, {event, senderId, session, source: 'quickReply', text: payload, normalizedText: this.normalizeString(payload)}));
      this.emit('message.quickReply', new Response(this, {event, senderId, session, payload}));
      return;
    }

    if (text) {
      debug('text user:%d text: "%s" count: %s seq: %s', senderId, text, session.count, message.seq);
      this.emit('text', new Response(this, {event, senderId, session, source: 'text', text, normalizedText: this.normalizeString(text)}));
      this.emit('message.text', new Response(this, {event, senderId, session, text}));
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

      // One of many types that follow the same pattern:
      // - message.audio
      // - message.file
      // - message.image
      // - message.sticker
      // - message.thumbsup
      // - message.video
      // https://developers.facebook.com/docs/messenger-platform/webhook-reference/message

      this.emit(`message.${type}`, new Response(this, {event, senderId, session, attachment, url: attachment.payload.url}));
      return;
    }
  }

  onPostback(event, session/*: Session */) {
    const senderId = event.sender.id;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    const payload = event.postback.payload;
    debug("onPostback for user:%d with payload '%s'", senderId, payload);
    this.emit('postback', new Response(this, {event, senderId, session, payload}));

    if (this.emitOptionalEvents(event, senderId, session, payload)) {
      return;
    }
    this.emit('text', new Response(this, {event, senderId, session, source: 'postback', text: payload, normalizedText: this.normalizeString(payload)}));
  }

  // HELPERS
  //////////

  emitOptionalEvents(event, senderId, session, text) {
    if (this.options.emitGreetings && this.greetings.test(text)) {
      const firstName = session.profile && session.profile.first_name.trim() || '';
      const surName = session.profile && session.profile.last_name.trim() || '';
      const fullName = `${firstName} ${surName}`;

      this.emit('text.greeting', new Response(this, {event, senderId, session, firstName, surName, fullName}));
      return true;
    }

    if (this.help.test(text)) {
      this.emit('text.help', new Response(this, {event, senderId, session}));
      return true;
    }
    return false;
  }

  getCacheKey(senderId/*: number */)/*: string */ {
    return '' + senderId;
  }

  normalizeString(inputStr) {
    return inputStr.toLowerCase().trim();
  }

  saveSession(session/*: Object */)/*: Promise<Session> */ {
    return this.cache.set(session._key, session);
  }

  send(recipientId/*: number */, messageData/*: Object */) {
    return this.pageSend(config.get('facebook.pageId'), recipientId, messageData);
  }

  pageSend(pageId/*: string|number */, recipientId/*: string|number */, messageData/*: Object */)/* Promise<Object> */ {
    let pageAccessToken = this.pages[pageId];
    if (!pageAccessToken) {
      throw new Error(`Missing page config for: ${pageId}`);
    }
    const options = {
      uri: 'https://graph.facebook.com/v2.8/me/messages',
      qs: { access_token: pageAccessToken },
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
        this.conversationLogger.logOutgoing(options, jsonObj);
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

exports.SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MS;
exports.Messenger = Messenger;
exports.Response = Response;
