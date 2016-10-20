// Based on https://github.com/fbsamples/messenger-platform-samples/tree/master/node
const crypto = require('crypto');
const EventEmitter = require('events');

const bodyParser = require('body-parser');
const debug = require('debug')('lenses:messenger');
const express = require('express');
const logError = require('debug')('lenses:messenger:error');
const request = require('request');

const {
  MESSENGER_HOOK_PATH,
  VALIDATION_TOKEN,
  APP_SECRET,
  PAGE_ACCESS_TOKEN
} = require('./config');


const app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');

const eventEmitter = new EventEmitter();


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

function send(recipientId, messageData) {
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

// MESSAGE TYPES
////////////////

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

function receiveMessage(event) {
  var senderId = event.sender.id;
  var recipientId = event.recipient.id;
  const {message, timestamp} = event;

  eventEmitter.emit('message', senderId, message);
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
    send(senderId, msg.text('Quick reply tapped'));
    return;
  }

  if (text) {
    debug(text);
    eventEmitter.emit('message.text', senderId, text);
    return;
  }

  if (attachments) {
    // Currently, we can assume there is only one attachment in a message
    const attachment = attachments[0];
    let type = attachment.type;

    if (message.sticker_id) {
      // There's a special thumbsup button in the interface that comes in like a sticker
      type = (message.sticker_id === 369239263222822) ? 'thumbsup' : 'sticker';
    }

    eventEmitter.emit(`message.${type}`, senderId, attachment);
    send(senderId, msg.text('Message with attachment received'));
    return;
  }
}

function receivedPostback(event) {
  const senderId = event.sender.id;
  const recipientId = event.recipient.id;
  const timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  const payload = event.postback.payload;

  debug("Received postback for user %d and page %d with payload '%s' at %d",
    senderId, recipientId, payload, timeOfPostback);

  eventEmitter.emit('postback', senderId, payload);

  // When a postback is called, we'll send a message back to the sender to
  // let them know it was successful
  send(senderId, msg.text('Postback called'));
}

app.use(bodyParser.json({ verify: verifyRequestSignature }));
// app.use(express.static('public'));  // TODO (goes with SERVER_URL)

// Facebook Messenger verification
app.get(MESSENGER_HOOK_PATH, (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    debug('Validating webhook');
    res.status(200).send(req.query['hub.challenge']);
  } else {
    debug('Failed validation. Make sure the validation tokens match.');
    res.sendStatus(403);
  }
});

app.post(MESSENGER_HOOK_PATH, (req, res) => {
  const data = req.body;
  // `data` reference:
  // https://developers.facebook.com/docs/messenger-platform/webhook-reference#format
  if (data.object === 'page') {
    data.entry.forEach((pageEntry) => {
      // const pageId = pageEntry.id;
      // const eventTs = pageEntry.time;
      pageEntry.messaging.forEach(function (messagingEvent) {
        if (messagingEvent.optin) {
          debug('incoming authentication event');
        } else if (messagingEvent.message) {
          debug('incoming message');
          receiveMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          debug('incoming delivery event');
        } else if (messagingEvent.postback) {
          debug('incoming postback');
          receivedPostback(messagingEvent);
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


app.set('port', process.env.PORT || 3000);

function start() {
  app.listen(app.get('port'), function (err) {
    if (err) throw err;
    debug('Server running on port %s', app.get('port'));
  });
}

module.exports._app = app;
module.exports.events = eventEmitter;
module.exports.msg = msg;
module.exports.receiveMessage = receiveMessage;
module.exports.send = send;
module.exports.start = start;
