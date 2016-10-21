// Based on https://github.com/fbsamples/messenger-platform-samples/tree/master/node
const crypto = require('crypto');
const EventEmitter = require('events');

const bodyParser = require('body-parser');
const debug = require('debug')('lenses:messenger');
const express = require('express');
const logError = require('debug')('lenses:messenger:error');
const request = require('request');

const {
  VALIDATION_TOKEN,
  APP_SECRET,
  PAGE_ACCESS_TOKEN
} = require('./config');


function verifyRequestSignature(req, res, buf) {
  const signature = req.headers['x-hub-signature'];

  if (!signature) {
    throw new Error(`Couldn't validate the signature with app secret: ${APP_SECRET}`);
  }

  const [method, signatureHash] = signature.split('=');
  // TODO assert method === 'sha1'
  const expectedHash = crypto.createHmac(method, APP_SECRET).update(buf).digest('hex');

  if (signatureHash !== expectedHash) {
    throw new Error(`Couldn't validate the request signature: ${APP_SECRET}`);
  }
};


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
  constructor({port, hookPath = '/webhook'} = {}) {
    super();

    // XXX this is awkward, I should learn how to use destructuring better or is that too fancy?
    this.options = {
      port: port || process.env.PORT || 3000,
      hookPath
    };

    this.app = express();
    this.app.set('view engine', 'ejs');

    this.app.use(bodyParser.json({ verify: verifyRequestSignature }));
    // this.app.use(express.static('public'));  // TODO (goes with SERVER_URL)

    // Facebook Messenger verification
    this.app.get(hookPath, (req, res) => {
      if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
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
          pageEntry.messaging.forEach((messagingEvent) => {
            if (messagingEvent.optin) {
              debug('incoming authentication event');
            } else if (messagingEvent.message) {
              debug('incoming message');
              this.receiveMessage(messagingEvent);
            } else if (messagingEvent.delivery) {
              debug('incoming delivery event');
            } else if (messagingEvent.postback) {
              debug('incoming postback');
              this.receivePostback(messagingEvent);
            } else if (messagingEvent.read) {
              debug('incoming read event');
            } else {
              debug('incoming unknown messagingEvent: %o', messagingEvent);
            }
          });
        });
        res.sendStatus(200);
      }
    });
  }

  start() {
    this.app.listen(this.options.port, (err) => {
      if (err) throw err;
      debug('Server running on port %s', this.options.port);
      // TODO console.log(`Set your webhook to: `)
    });
  }

  receiveMessage(event) {
    var senderId = event.sender.id;
    var recipientId = event.recipient.id;
    const {message, timestamp} = event;

    this.emit('message', senderId, message);
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
      this.emit('message.text', senderId, text);
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

      this.emit(`message.${type}`, senderId, attachment);
      this.send(senderId, msg.text('Message with attachment received'));
      return;
    }
  }

  receivePostback(event) {
    const senderId = event.sender.id;
    const recipientId = event.recipient.id;
    const timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    const payload = event.postback.payload;

    debug("Received postback for user %d and page %d with payload '%s' at %d",
      senderId, recipientId, payload, timeOfPostback);

    this.emit('postback', senderId, payload);

    // When a postback is called, we'll send a message back to the sender to
    // let them know it was successful
    this.send(senderId, msg.text('Postback called'));
  }

  send(recipientId, messageData) {
    // WISHLIST return a promise, just use `request-promise` instead of `request`
    request({
      uri: 'https://graph.facebook.com/v2.8/me/messages',
      qs: { access_token: PAGE_ACCESS_TOKEN },
      method: 'POST',
      json: {
        recipient: {
          id: recipientId
        },
        message: messageData
      }
    }, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        const {recipient_id: recipientId, message_id: messageId} = body;

        if (messageId) {
          debug('Successfully sent message with id %s to recipient %s', messageId, recipientId);
        } else {
          debug('Successfully called Send API for recipient %s', recipientId);
        }
      } else {
        logError('Failed calling Send API', response.statusCode, response.statusMessage, body.error);
      }
    });
  }
}


module.exports.Messenger = Messenger;
module.exports.msg = msg;
