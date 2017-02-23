const debug = require('debug')('messenger');

const dispatcher = require('./dispatcher');

exports.onAuth = function (messenger, event, session) {
  const senderId = event.sender.id;
  // The 'ref' is the data passed through the 'Send to Messenger' call
  const optinRef = event.optin.ref;
  messenger.emit('auth', {event, senderId, session, optinRef});
  debug('onAuth for user:%d with param: %j', senderId, optinRef);
};

/*
  This is not an event triggered by Messenger, it is the post-back from the
  static Facebook login page that is made to look similar to an 'event'
*/
exports.onLink = function (messenger, event) {
  const senderId = event.sender.id;
  const fbData = event.facebook;
  debug('onLink for user:%d with data: %o', senderId, fbData);
  messenger.emit('link', {event, senderId, fbData});
  return;
};

exports.onMessage = function (messenger, event, session) {
  const senderId = event.sender.id;
  const {message} = event;

  messenger.emit('message', {event, senderId, session, message});
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

  if (messenger.options.emitGreetings && messenger.greetings.test(text)) {
    const firstName = session.profile.first_name.trim();
    const surName = session.profile.last_name.trim();
    const fullName = `${firstName} ${surName}`;

    messenger.emit('text.greeting', {event, senderId, session, firstName, surName, fullName});
    return;
  }

  if (messenger.help.test(text)) {
    messenger.emit('text.help', {event, senderId, session});
    return;
  }

  if (quickReply) {
    debug('message.quickReply payload: "%s"', quickReply.payload);

    messenger.emit('text', {event, senderId, session, source: 'quickReply', text: quickReply.payload});
    messenger.emit('message.quickReply', {event, senderId, session, payload: quickReply.payload});
    return;
  }

  if (text) {
    debug('text user:%d text: "%s" count: %s seq: %s',
      senderId, text, session.count, message.seq);
    messenger.emit('text', {event, senderId, session, source: 'text', text: text.toLowerCase().trim()});
    messenger.emit('message.text', {event, senderId, session, text});
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

    messenger.emit(`message.${type}`, {event, senderId, session, attachment, url: attachment.payload.url});
    return;
  }
};

exports.onPostback = function (messenger, event, session) {
  const senderId = event.sender.id;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  const payload = event.postback.payload;

  debug("onPostback for user:%d with payload '%s'", senderId, payload);

  messenger.emit('text', {event, senderId, session, source: 'postback', text: payload});
  messenger.emit('postback', {event, senderId, session, payload});
};

exports.init = function (messenger) {
  dispatcher.on('app.session.ready', ({messagingEvent, session}) => {
    if (messagingEvent.optin) {
      session.source = 'web';
      dispatcher.emit('session.changed', {session});
      exports.onAuth(messenger, messagingEvent, session);
    } else if (messagingEvent.message) {
      exports.onMessage(messenger, messagingEvent, session);
    } else if (messagingEvent.delivery) {
      debug('incoming delivery event');
    } else if (messagingEvent.postback) {
      exports.onPostback(messenger, messagingEvent, session);
    } else if (messagingEvent.read) {
      debug('incoming read event');
    } else {
      debug('incoming unknown messagingEvent: %o', messagingEvent);
    }
  });
};
