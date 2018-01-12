// @flow weak
const bodyParser = require('body-parser');
const Cacheman = require('cacheman');
const crypto = require('crypto');
const EventEmitter = require('events');

const debug = require('debug')('messenger');
const logError = require('debug')('messenger:error');
const express = require('express');
const exphbs = require('express-handlebars');
const reqPromise = require('request-promise');
const urlJoin = require('url-join');

const config = require('./config');
const { ConversationLogger } = require('./conversationLogger');


const SESSION_TIMEOUT_MS = 24 * 3600 * 1000; // 24 hours
const PAUSE_TIMEOUT_MS = 12 * 3600 * 1000; // 12 hours

const DEFAULT_GREETINGS_REGEX = /^(get started|good(morning|afternoon)|hello|hey|hi|hola|what's up)/i;
const DEFAULT_HELP_REGEX = /^help\b/i;

/*:: type Session = {_pageId: string|number, count: number, profile: ?Object, paused?: number|false} */

function PausedUserError(session) {
  this.name = 'PausedUserError';
  this.session = session;
  this.message = 'Thrown to prevent responding to a user';
}

function normalizeString(inputStr) {
  return inputStr.toLowerCase().trim();
}

/**
 * Class representing a Messenger response
 */
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

  /**
   * Reply with a response
   * @param  {Object} responseMessage The response message to send back
   * @return {Promise} When the reply is done
   */
  reply(responseMessage/*: Object */)/*: Promise<any> */ {
    return this._messenger.pageSend(this.session._pageId, this.senderId, responseMessage);
  }
}

/**
 * Messenger
 * @string object.hookpath default: /webhook
 */
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
      hookPath
    };

    if (cache) {
      this.cache = cache;
    } else {
      this.cache = new Cacheman('sessions', { ttl: SESSION_TIMEOUT_MS / 1000 });
    }

    if (pages && Object.keys(pages).length) {
      this.pages = pages;
    } else if (config.has('messenger.pageAccessToken') && config.has('facebook.pageId')) {
      this.pages = { [config.get('facebook.pageId')]: config.get('messenger.pageAccessToken') };
    } else {
      this.pages = {};
      debug("MISSING options.pages; you won't be able to reply or get profile information");
    }

    this.app = express();
    this.app.engine('handlebars', exphbs({ defaultLayout: 'main' }));
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
      // `data` reference:
      // https://developers.facebook.com/docs/messenger-platform/webhook-reference#format
      if (data.object === 'page' && data.entry) {
        const messagingEvents = data.entry.filter(x => x.messaging);
        if (messagingEvents.length) {
          this.conversationLogger.logIncoming(data);
          messagingEvents.forEach((pageEntry) => {
            pageEntry.messaging.forEach(x => this.routeEachMessage(x, pageEntry.id));
          });
        } else {
          debug('No messaging events found in %j', data);
        }
      }
      // Default to sending a 200 even for "bad" requests so Facebook doesn't flag our app
      res.sendStatus(200);
    });

    // Stub routes for future functionality
    this.app.post('/link', (req, res) => {
      this.onLink(req.body);
      res.sendStatus(200);
    });
    this.app.get('/login', (req, res) => res.render('login', {
      appId: config.get('facebook.appId'),
      serverUrl: config.get('serverUrl')
    }));
    this.app.get('/send-to-messenger', (req, res) => res.render('send-to-messenger', {
      appId: config.get('facebook.appId'),
      pageId: config.get('facebook.pageId')
    }));

    this.app.post('/pause', bodyParser.json(), (req, res) => {
      const { userId, paused } = req.body;
      if (!userId && paused === undefined) {
        res.sendStatus(400);
        return;
      }

      const cacheKey = this.getCacheKey(userId);
      this.cache.get(cacheKey)
        .then((session/*: ?Session */)/*: Promise<Session> */ => {
          if (!session) {
            throw new Error("Can't pause unknown user");
          }
          session.paused = paused ? Date.now() : false;
          return this.cache.set(userId, session);
        })
        .then(() => res.send('ok'))
        .catch((err) => {
          if (err.message === "Can't pause unknown user") {
            res.sendStatus(412);
            return;
          }

          throw err;
        });
    });

    // Boilerplate routes
    this.app.get('/', (req, res) => res.send('👍'));
    this.app.get('/ping', (req, res) => res.send('pong'));
  }

  /**
   * Start the web server and listen for messages
   * @return {void}
   */
  start() {
    const port = config.get('port');
    this.emit('app.starting', { port });
    this.app.listen(port, (err) => {
      if (err) throw err;
      this.emit('app.started', { port });
      debug('Server running on: http://localhost:%s Set your webhook to: %s', port, urlJoin(config.get('serverUrl'), this.options.hookPath));
    });
  }

  routeEachMessage(messagingEvent/*: Object */, pageId/*: string */)/*: Promise<Session> */ {
    const cacheKey = this.getCacheKey(messagingEvent.sender.id);
    return this.cache.get(cacheKey)
      // The cacheman-redis backend returns `null` instead of `undefined`
      .then(cacheResult => cacheResult || undefined)
      .then((session/*: Session */ = {
        _key: cacheKey, _pageId: pageId, count: 0, profile: null
      }) => {
        // $FlowFixMe Flow can't infer that session.paused is a number
        if (session.paused && Date.now() - session.paused < PAUSE_TIMEOUT_MS) {
          throw new PausedUserError(session);
        }

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
          })
          .catch((err) => {
            logError(err.message);
            session.profile = {};
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
        } else if (messagingEvent.referral) {
          this.onReferral(messagingEvent, session);
        } else {
          debug('incoming unknown messagingEvent: %o', messagingEvent);
        }
        return session;
      })
      .then(session => this.saveSession(session))
      .catch((err) => {
        if (err.name === 'PausedUserError') {
          return err.session;
        }

        throw err;
      });
  }

  // TODO flesh these out later
  doLogin(senderId/*: number */, pageId/*: string */) {
    // Open question: is building the event object worth it for the 'emit'?
    const event = {
      sender: { id: senderId },
      recipient: { id: pageId },
      timestamp: new Date().getTime()
    };
    this.emit('login', { event, senderId });
    debug('doLogin request for user:%d', senderId);

    const responseMessage = {
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
    this.pageSend(pageId, senderId, responseMessage);
  }

  getPublicProfile(senderId/*: number */, pageId/*: string */)/*: Promise<Object> */ {
    const pageAccessToken = this.pages[pageId];
    if (!pageAccessToken) {
      return Promise.reject(new Error(`getPublicProfile: Missing page config for: ${pageId || ''}`));
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
    this.emit('auth', new Response(this, {
      event, senderId, session, optinRef
    }));
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
    this.emit('link', { event, senderId, fbData });
  }

  onMessage(event, session/*: Session */) {
    const senderId = event.sender.id;
    const { message } = event;

    this.emit('message', new Response(this, {
      event, senderId, session, message
    }));
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
      const { payload } = quickReply;
      debug('message.quickReply payload: "%s"', payload);
      this.emit('text', new Response(this, {
        event, senderId, session, source: 'quickReply', text: payload, normalizedText: normalizeString(payload)
      }));
      this.emit('message.quickReply', new Response(this, {
        event, senderId, session, payload
      }));
      return;
    }

    if (text) {
      debug('text user:%d text: "%s" count: %s seq: %s', senderId, text, session.count, message.seq);
      this.emit('text', new Response(this, {
        event, senderId, session, source: 'text', text, normalizedText: normalizeString(text)
      }));
      this.emit('message.text', new Response(this, {
        event, senderId, session, text
      }));
      return;
    }

    if (attachments) {
      // Currently, we can assume there is only one attachment in a message
      const attachment = attachments[0];
      let { type } = attachment;

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

      this.emit(`message.${type}`, new Response(this, {
        event, senderId, session, attachment, url: attachment.payload.url
      }));
    }
  }

  onPostback(event, session/*: Session */) {
    const senderId = event.sender.id;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    const { payload } = event.postback;
    debug("onPostback for user:%s with payload '%s'", senderId, payload);
    this.emit('postback', new Response(this, {
      event, senderId, session, payload
    }));

    if (this.emitOptionalEvents(event, senderId, session, payload)) {
      return;
    }
    this.emit('text', new Response(this, {
      event, senderId, session, source: 'postback', text: payload, normalizedText: normalizeString(payload)
    }));
  }

  onReferral(event, session/*: Session */) {
    const senderId = event.sender.id;
    const payload = event.referral;
    debug("onReferral for user:%s with payload '%s'", senderId, payload);
    this.emit('referral', new Response(this, {
      event, senderId, session, referral: payload
    }));
  }

  // HELPERS
  //////////

  // eslint-disable-next-line complexity
  emitOptionalEvents(event, senderId, session, text) {
    if (this.options.emitGreetings && this.greetings.test(text)) {
      const firstName = session.profile && session.profile.first_name && session.profile.first_name.trim() || '';
      const surName = session.profile && session.profile.last_name && session.profile.last_name.trim() || '';
      const fullName = `${firstName} ${surName}`;

      this.emit('text.greeting', new Response(this, {
        event, senderId, session, firstName, surName, fullName
      }));
      return true;
    }

    if (this.help.test(text)) {
      this.emit('text.help', new Response(this, { event, senderId, session }));
      return true;
    }
    return false;
  }

  // eslint-disable-next-line class-methods-use-this
  getCacheKey(senderId/*: number */)/*: string */ {
    return '' + senderId;
  }

  saveSession(session/*: Object */)/*: Promise<Session> */ {
    return this.cache.set(session._key, session);
  }

  /**
   * Send a response to the default page
   *
   * .. deprecated:: 1.4.0
   *    Use :meth:`Response.reply` instead
   * @param  {number} recipientId Recipient ID
   * @param  {Object} responseMessage The response message to send back
   * @return {Promise} A promise for sending the response
   */
  send(recipientId/*: number */, responseMessage/*: Object */)/*: Promise<any> */ {
    return this.pageSend(config.get('facebook.pageId'), recipientId, responseMessage);
  }

  /**
   * Send a response to a user at a page.
   * This is the long way of sending a message.
   * You probably want to use shortcut :meth:`Response.reply` instead.
   *
   * The SDK sets the `messaging_type <https://developers.facebook.com/docs/messenger-platform/send-messages#messaging_types>`_ for all messages to ``RESPONSE``.
   * because all messages are sent in response to a user action.
   * It's possible to use send other message types but setting another
   * ``messaging_type`` is currently unsupported.
   * @param  {string} pageId Page ID
   * @param  {string} recipientId Recipient ID
   * @param  {Object} responseMessage The response message to send back
   * @return {Promise} A promise for sending the response
   */
  pageSend(pageId/*: string|number */, recipientId/*: string|number */, responseMessage/*: Object */)/* Promise<Object> */ {
    const pageAccessToken = this.pages[pageId];
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
        message: responseMessage,
        messaging_type: 'RESPONSE' // options: RESPONSE, UPDATE, MESSAGE_TAG, NON_PROMOTIONAL_SUBSCRIPTION
      }
    };
    debug('message.send: %j', options);

    return reqPromise.post(options)
      .then((jsonObj) => {
        this.conversationLogger.logOutgoing(options, jsonObj);
        const { recipient_id: recipientId, message_id: messageId } = jsonObj;
        debug('message.send:SUCCESS message id: %s to user:%d', messageId, recipientId);
      })
      .catch((err) => {
        logError('message.send:FAIL user:%d error: %s', recipientId, err);
      });
  }

  // eslint-disable-next-line class-methods-use-this
  verifyRequestSignature(req, res, buf) {
    const signature = req.headers['x-hub-signature'];

    if (!signature) {
      // TODO convert `config.get` to `this.config.appSecret https://github.com/CondeNast/launch-vehicle-fbm/issues/27
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
exports.normalizeString = normalizeString;
exports.Messenger = Messenger;
exports.Response = Response;
