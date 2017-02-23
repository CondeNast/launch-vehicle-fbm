const debug = require('debug')('messenger'); // TODO Should this be dispatcher?
const internals = {};

internals.onAuth = function (app, event, session) {
  const senderId = event.sender.id;
  // The 'ref' is the data passed through the 'Send to Messenger' call
  const optinRef = event.optin.ref;
  app.emit('auth', {event, senderId, session, optinRef});
  debug('onAuth for user:%d with param: %j', senderId, optinRef);
};

internals.onMessage = function (app, event, session) {
  const senderId = event.sender.id;
  const {message} = event;

  app.emit('message', {event, senderId, session, message});
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

  if (app.options.emitGreetings && app.greetings.test(text)) {
    const firstName = session.profile.first_name.trim();
    const surName = session.profile.last_name.trim();
    const fullName = `${firstName} ${surName}`;

    app.emit('text.greeting', {event, senderId, session, firstName, surName, fullName});
    return;
  }

  if (app.help.test(text)) {
    app.emit('text.help', {event, senderId, session});
    return;
  }

  if (quickReply) {
    debug('message.quickReply payload: "%s"', quickReply.payload);

    app.emit('text', {event, senderId, session, source: 'quickReply', text: quickReply.payload});
    app.emit('message.quickReply', {event, senderId, session, payload: quickReply.payload});
    return;
  }

  if (text) {
    debug('text user:%d text: "%s" count: %s seq: %s',
        senderId, text, session.count, message.seq);
    app.emit('text', {event, senderId, session, source: 'text', text: text.toLowerCase().trim()});
    app.emit('message.text', {event, senderId, session, text});
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

    app.emit(`message.${type}`, {event, senderId, session, attachment, url: attachment.payload.url});
    return;
  }
};

internals.onPostback = function (app, event, session) {
  const senderId = event.sender.id;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  const payload = event.postback.payload;

  debug("onPostback for user:%d with payload '%s'", senderId, payload);

  app.emit('text', {event, senderId, session, source: 'postback', text: payload});
  app.emit('postback', {event, senderId, session, payload});
};

exports.register = function (app) {
  app.on('message-received', function ({message, session}) {
    if (message.optin) {
      session.source = 'web';
      internals.onAuth(app, message, session);
    } else if (message.message) {
      internals.onMessage(app, message, session);
    } else if (message.delivery) {
      debug('incoming delivery event');
    } else if (message.postback) {
      internals.onPostback(app, message, session);
    } else if (message.read) {
      debug('incoming read event');
    } else {
      debug('incoming unknown messagingEvent: %o', message);
    }
  });
};

exports.__internals__ = internals;
