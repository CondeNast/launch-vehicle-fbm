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

const cache = new Cacheman('sessions');

// MESSAGE TYPES
////////////////

// NOTE: I'm not sure if this should be used. This wrapper may be too thin.
// For now, keep it around as a reference.

const msg = {
  text: (text) => ({
    text,
    metadata: 'DEVELOPER_DEFINED_METADATA'
  }),
  image: (url) => ({
    attachment: {
      type: 'image',
      payload: {url}
    }
  }),
  audio: (url) => ({
    attachment: {
      type: 'audio',
      payload: {url}
    }
  }),
  video: (url) => ({
    attachment: {
      type: 'video',
      payload: {url}
    }
  }),
  file: (url) => ({
    attachment: {
      type: 'file',
      payload: {url}
    }
  })
};


// MESSENGER CLIENT
///////////////////

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
        if (messagingEvent.optin) {
          debug('incoming authentication event');
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

  onAuth(event) {
    const senderId = event.sender.id;
    const recipientId = event.recipient.id;
    const timeOfAuth = event.timestamp;
    // The 'ref' is the data passed through the 'Send to Messenger' call
    const optinRef = event.optin.ref;
    this.emit('auth', {event, senderId, optinRef});
    debug('Received auth for user %d and page %d at %d with param:\n%o',
      senderId, recipientId, timeOfAuth, optinRef);
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

    this.send(senderId, msg.text('Thanks for logging in with Facebook.'));
    this.send(senderId,
      msg.text(`You'll always be more than just #${fbData.id} to us`));
  }

  onMessage(event, session) {
    var senderId = event.sender.id;
    var recipientId = event.recipient.id;
    const {message, timestamp} = event;

    this.emit('message', {event, senderId, session, message});
    debug('Received message for user %d and page %d at %d with message:\n%o',
      senderId, recipientId, timestamp, message);

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
      this.send(senderId, msg.text('Quick reply tapped'));
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
    debug('Sending message: %o', options);

    return reqPromise(options)
      .then((jsonObj) => {
        if (this.dashbotClient) {
          this.dashbotClient.logOutgoing(options, jsonObj);
        }
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

const internals = {};
internals.cache = cache;
exports.__internals__ = internals;
exports.Messenger = Messenger;
exports.msg = msg;
