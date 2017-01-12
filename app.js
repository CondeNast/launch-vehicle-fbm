// Based on https://github.com/fbsamples/messenger-platform-samples/tree/master/node
const crypto = require('crypto');
const EventEmitter = require('events');

const bodyParser = require('body-parser');
const Cacheman = require('cacheman');
const dashbot = require('dashbot');
const debug = require('debug')('lenses:messenger');
const express = require('express');
const exphbs = require('express-handlebars');
const logError = require('debug')('lenses:messenger:error');
const reqPromise = require('request-promise');
const urlJoin = require('url-join');
const conversationLogger = require('./conversationLogger');
const {Text} = require('./objects');

const cache = new Cacheman('sessions');

const SESSION_TIMEOUT_MS = 3600 * 1000;  // 1 hour

const internals = {};


class Messenger extends EventEmitter {
  constructor(config, {hookPath = '/webhook', linkPath = '/link'} = {}) {
    super();

    this.config = config;

    this.options = {
      hookPath,
      linkPath
    };

    this.app = express();
    this.app.engine('handlebars', exphbs({defaultLayout: 'main'}));
    this.app.set('view engine', 'handlebars');

    this.app.use(bodyParser.json({ verify: this.verifyRequestSignature.bind(this) }));
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(express.static('public'));

    if (this.config.has('dashbotKey')) {
      this.dashbotClient = dashbot(this.config.get('dashbotKey')).facebook;
    } else {
      debug('No DASHBOT_KEY specified; no data will be sent to DashBot.');
    }

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
      if (this.dashbotClient) {
        this.dashbotClient.logIncoming(data);
      }
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
        session.count++;
        if (session.source !== 'return' &&
            session.lastSeen &&
            // have to use `internals` here for testability
            new Date().getTime() - session.lastSeen > internals.SESSION_TIMEOUT_MS) {
          session.source = 'return';
        }
        session.lastSeen = new Date().getTime();
        if (messagingEvent.optin) {
          debug('incoming authentication event');
          session.source = 'web';
          this.onAuth(messagingEvent, session);
        } else if (messagingEvent.message) {
          debug('incoming message');
          this.onMessage(messagingEvent, session);
        } else if (messagingEvent.delivery) {
          debug('incoming delivery event');
        } else if (messagingEvent.postback) {
          debug('incoming postback');
          this.onPostback(messagingEvent, session);
        } else if (messagingEvent.read) {
          debug('incoming read event');
        } else {
          debug('incoming unknown messagingEvent: %o', messagingEvent);
        }
        return session;
      })
      .then((session) => cache.set(cacheKey, session));
  }

  doLogin(senderId) {
    // Open question: is building the event object worth it for the 'emit'?
    const event = {
      sender: {id: senderId},
      recipient: {id: this.config.get('facebook.pageId')},
      timestamp: new Date().getTime()
    };
    this.emit('login', {event, senderId});
    debug('Received login request for user %d', senderId);

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
    return reqPromise(options)
      .then((jsonObj) => {
        return jsonObj;
      })
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
    debug('Received auth for user %d with param: %o', senderId, optinRef);
  }

  /*
    This is not an event triggered by Messenger, it is the post-back from the
    static Facebook login page that is made to look similar to an 'event'
  */
  onLink(event) {
    const senderId = event.sender.id;
    const recipientId = event.recipient.id;
    const timeOfLink = event.timestamp;

    const fbData = event.facebook;
    this.emit('link', {event, senderId, fbData});
    debug('Received link for user %d and page %d at %d with data:\n%o',
      senderId, recipientId, timeOfLink, fbData);

    this.send(senderId, new Text('Thanks for logging in with Facebook.'));
    this.send(senderId, new Text(`You'll always be more than just #${fbData.id} to us`));
  }

  onMessage(event, session) {
    const senderId = event.sender.id;
    const {message} = event;

    this.emit('message', {event, senderId, session, message});
    debug('Received message from user %d with message: %j', senderId, message);

    const {
      mid: messageId,
      app_id: appId,
      metadata,
      quick_reply: quickReply,
      // You may get a text or attachment but not both
      text,
      attachments
    } = message;

    if (message.is_echo) {
      debug('Received echo for message %s and app %d with metadata %s', messageId, appId, metadata);
      return;
    }

    if (quickReply) {
      debug('Quick reply for message %s with payload %s', messageId, quickReply.payload);
      // FIXME: this is a workaround while we figure out what is going on with https://github.com/CondeNast/rkt-beauty-lenses/issues/176
      // For some reason, quick reply payloads started coming through as base 64 encoded strings of "mnqp_<FB_APP_ID>_<FB_PAGE_ID>_<PAYLOAD>"
      debug('Emitting quick reply event with text %s', text);
      this.emit('message.quickReply', {event, senderId, session, payload: text});
      return;
    }

    if (text) {
      debug(text);
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
    const recipientId = event.recipient.id;
    const timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    const payload = event.postback.payload;

    debug("Received postback for user %d and page %d with payload '%s' at %d",
      senderId, recipientId, payload, timeOfPostback);

    this.emit('postback', {event, senderId, session, payload});
  }

  // HELPERS
  //////////

  send(recipientId, messageData) {
    const options = {
      uri: 'https://graph.facebook.com/v2.8/me/messages',
      qs: { access_token: this.config.get('messenger.pageAccessToken') },
      method: 'POST',
      json: {
        dashbotTemplateId: 'right',
        recipient: {
          id: recipientId
        },
        message: messageData
      }
    };
    debug('Sending message: %j', options);

    return reqPromise(options)
      .then((jsonObj) => {
        if (this.dashbotClient) {
          // TODO should we strip pageAccessToken before giving it to dashbotClient?
          this.dashbotClient.logOutgoing(options, jsonObj);
        }
        conversationLogger.logOutgoing(options, jsonObj);
        const {recipient_id: recipientId, message_id: messageId} = jsonObj;
        debug('Successfully sent message with id %s to recipient %s', messageId, recipientId);
      })
      .catch((err) => {
        logError('Failed calling Send API', err);
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
