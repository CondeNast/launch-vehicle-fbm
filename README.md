Facebook Messenger Chat Kit
===========================

An event driven SDK for Facebook Messenger chat bots.

To make writing for the platform easier, this project wraps the Messenger calls
up in a library. It also supports a login with Facebook flow since Messenger
does not provide this natively.


Usage
-----

```javascript
const { Messenger } = require('launch-vehicle-fbm');
const messenger = new Messenger(options);
messenger.start();  // Start listening
```

### Options

* `port` (default: `3000`)
* `hookPath` (default: `/webhook`)
* `linkPath` (default: `/link`)
* `emitGreetings` (default: true)
  When enabled, emits common greetings as `text.greeting` events.
  When disabled, no check is run and `text` events will be emitted.
  Optionally, can be set to a `RexExp` object which will enable the option and use the specified expression instead of the built-in default.

Additional options are set via environment variables. See `example.env` for an
example.

### Responding to events

We emit a variety of events. Attach listeners like:
```javascript
// General form
// messenger.on(eventName, ({dataItem1, dataItem2}) => {});
const { Messenger, Text, Image } = require('launch-vehicle-fbm');
const messenger = new Messenger();
messenger.on('text', ({senderId, text}) => {
  if (text.includes('corgis')) {
    messenger.send(senderId, new Text('aRf aRf!'))
      .then(() => messenger.send(senderId, new Image('https://i.imgur.com/izwcQLS.jpg')));
  }
});
messenger.start();
```

The event name and what's in the `data` for each event handler:

* `message` Any kind of message event. This is sent in addition to the events for specific message types.
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` A Session object you can mutate
  * `message` Direct access to `event.message`
* `text` Text message
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` A Session object you can mutate
  * `source` One of `quickReply`, `postback`, `text`
  * `text` Message content, `event.message.text` for text events, `payload` for `postback` and `quickReply` events
* `text.greeting` (optional, defaults to enabled) Text messages that match common greetings
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` A Session object you can mutate
  * `firstName` Trimmed first name from the user's public Facebook profile
  * `surName` Trimmed first name from the user's public Facebook profile
  * `fullName` Concatenating of `firstName` and `surName` with a single, separating space
* `text.help` (optional, defaults to enabled) Text messages that match requests for assistance
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` A Session object you can mutate
* `message.image` Image (both attached and from user's camera)
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` A Session object you can mutate
  * `url` Direct access to `event.message.attachments[0].payload.url` for the url of the image
* `message.sticker` Sticker
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` A Session object you can mutate
* `message.thumbsup` User clicked the "thumbsup"/"like" button
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` A Session object you can mutate
* `message.text` For conversation, use the `text` event
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` A Session object you can mutate
  * `text` Message content, `event.message.text` for text events
* `message.quickReply` For conversation, use the `text` event, this is for the raw message sent via a quick reply button
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` A Session object you can mutate
  * `source` One of `quickReply`, `postback`, `text`
  * `payload` Quick reply content, `event.quick_reply.payload`
* `postback` For conversation, use the `text` event, this is for the raw message sent via a postback
  * `event` The raw event
  * `senderId` The ID of the sender
  * `payload` Direct access to `event.postback.payload`

* `finish` (optional) Signal that you're done processing. This is mostly useful
  for your tests when you have Promise chains. The SDK currently does nothing
  with this event.

  [postback]: https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received


### Sending responses to the user

Some factories for generating responses are available at the top level and are
also available in a `responses` object if you need a namespace:

    const { Text, Image, Generic, ImageQuickReply } = require('launch-vehicle-fbm');
    const { responses } = require('launch-vehicle-fbm');
    // responses.Text, responses.Image, etc.

The most common response is text:

    new Text('Hello World')

Images just need a url. These also show up in the "Shared Photos" rail.

    new Image('https://i.imgur.com/ehSTCkO.gif')

There are a few others that are supported too:

* `new Generic(elements[])`
  https://developers.facebook.com/docs/messenger-platform/send-api-reference/generic-template
* `new ImageQuickReply('https://i.imgur.com/ehSTCkO.gif', quickReplies[])` NOTE: the syntax for quick replies may change in the future since it's orthogonal to `Text` and `Image`.
https://developers.facebook.com/docs/messenger-platform/send-api-reference/quick-replies


#### `Text` translation

`Text` supports [gettext]-like functionality if your project has a
`messages.js` in its root. Using this sample:

    module.exports = {
      greeting_msg: 'Hello World!'
    };

`new Text('greeting_msg')` would be equivalent of doing `new Text('Hello World!')`.

[gettext]: https://en.wikipedia.org/wiki/Gettext


The session object
------------------

The SDK uses [cacheman] to maintain session data per user. The `session` object is passed through each event
and can be read from or written to as needed. While the session is automatically saved in `routeEachMessage`,
there are instances where it may be advantageous to manually trigger a save; this can be accomplished by using
`messenger.saveSession`. The session object has a copy of its own session key (pro tip: do not modify or remove
  `_key`) so the session object is the only parameter that needs to be passed into `saveSession`.

[cacheman]: https://github.com/cayasso/cacheman

The SDK sets some values in the session:

* `count`: `int` how many events have been received from this user
* `lastSeen`: `int` The time (in milliseconds since epoch time) we last saw activity
* `source`: `String`|`undefined` A guess of where the user came from for this session:
  * `direct` TODO, not implemented yet
  * `return` A returning visitor
  * `web` Came from a "Send to Messenger" button on a website
  * `undefined` Unknown


Logging and metrics
-------------------

1. [debug] is for a firehose of data sent to stdout/stderr
2. [dashbot] is a service we're trying that gives us analytics tailored for bots.
3. [winston] is like [dashbot] and a subset of [debug], but it's designed
   specifically to let us recreate/monitor conversations.

Optional environment variables:


* `DASHBOT_KEY` - If this is present, [dashbot] integration will be on
* `LOG_FILE` – [winston] will log conversations to this file. It should be an absolute path
* `SLACK_CHANNEL` - The Slack channel [winston] should use, can be a name or an id
* `SLACK_WEBHOOK_URL` – The [webhook url] is required for [winston] to send to Slack

   [debug]: https://github.com/visionmedia/debug
   [dashbot]: https://www.dashbot.io/
   [winston]: https://github.com/winstonjs/winston
   [webhook url]: https://api.slack.com/incoming-webhooks


Prior art
---------

There are many other Messenger Node packages; we made a page to help you decide
if this is the appropriate one for your project:
https://github.com/CondeNast/launch-vehicle-fbm/wiki/Prior-art
