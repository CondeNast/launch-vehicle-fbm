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

* `cache` (default: [cacheman] memory cache) See [Session cache](#session-cache)
* `hookPath` (default: `/webhook`)
* `linkPath` (default: `/link`)
* `pages`: A map of page ids to page access tokens `{1029384756: 'ThatsAReallyLongStringYouGotThere'}`. Currently optional but config will migrate to this in the future
* `port` (default: `3000`)
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
messenger.on('text', ({reply, text}) => {
  if (text.includes('corgis')) {
    reply(new Text('aRf aRf!'))
      .then(() => reply(new Image('https://i.imgur.com/izwcQLS.jpg')));
  }
});
messenger.start();
```

The event name and what's in the `data` for each event handler.

* `message` Any kind of message event. This is sent in addition to the events for specific message types.
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
  * `message` Direct access to `event.message`
* `text` Text message
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `normalizedText` Normalized message content: `event.message.text` for text events and `payload` for `postback` and `quickReply` events
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
  * `source` One of `quickReply`, `postback`, `text`
  * `text` Original message content
* `text.greeting` (optional, defaults to enabled) Text messages that match common greetings
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
  * `firstName` Trimmed first name from the user's public Facebook profile
  * `surName` Trimmed first name from the user's public Facebook profile
  * `fullName` Concatenating of `firstName` and `surName` with a single, separating space
* `text.help` (optional, defaults to enabled) Text messages that match requests for assistance
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
* `message.image` Image (both attached and from user's camera)
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
  * `url` Direct access to `event.message.attachments[0].payload.url` for the url of the image
* `message.sticker` Sticker
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
* `message.thumbsup` User clicked the "thumbsup"/"like" button
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
* `message.text` For conversation, use the `text` event
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
  * `text` Message content, `event.message.text` for text events
* `message.quickReply` For conversation, use the `text` event, this is for the raw message sent via a quick reply button
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
  * `text` Quick reply content, `event.quick_reply.payload`
* `postback` For conversation, use the `text` event, this is for the raw message sent via a postback
  * `reply: Function` Reply back to the user with the arguments
  * `event` The raw event
  * `senderId` The ID of the sender
  * `session` [A Session object](#the-session-object) you can mutate
  * `text` Postback payload, `event.postback.payload`

* `finish` (optional) Signal that you're done processing. This is mostly useful
  for your tests when you have Promise chains. The SDK currently does nothing
  with this event.

  [postback]: https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received

#### Normalized message content

To help keep application code simple, the SDK makes these guarantees about _normalized text_:
* it will be lowercase
* it will be stripped of leading and trailing whitespace

#### A special note about echo events

If you enable `message_echoes` in your [Messenger webhooks], you'll get bot
messages too. You'll need to examine `event.message.is_echo` in your handlers.

[Messenger webhooks]: https://developers.facebook.com/docs/messenger-platform/webhook-reference#setup

### Sending responses to the user

You're given a `reply` in event emitters (see above):

    reply(responseObject)

The original syntax will also work:

    messenger.send(senderId, responseObject)

or if you have multiple Pages, you can send responses like:

    messenger.pageSend(pageId, senderId, responseObject)

Some factories for generating `responseObject` are available at the top level and
are also available in a `responses` object if you need a namespace:

    const { Text, Image, Generic, ImageQuickReply } = require('launch-vehicle-fbm');
    const { responses } = require('launch-vehicle-fbm');
    // responses.Text, responses.Image, responses.Generic, responses.ImageQuickReply etc.

The most common response is text:

    new Text('Hello World')

Images just need a url. These also show up in the "Shared Photos" rail.

    new Image('https://i.imgur.com/ehSTCkO.gif')

The full list:

* `new Text('Hello World')`
* `new Image('https://i.imgur.com/ehSTCkO.gif')`
* `new Generic(elements[])`
  https://developers.facebook.com/docs/messenger-platform/send-api-reference/generic-template
* `new ImageQuickReply('https://i.imgur.com/ehSTCkO.gif', quickReplies[])` NOTE: the syntax for quick replies may change in the future since it's orthogonal to `Text` and `Image`.
https://developers.facebook.com/docs/messenger-platform/send-api-reference/quick-replies


#### `Text` translation

`Text` supports [gettext]-like functionality if your project has a
`messages.js` in its root. Using this sample:

    module.exports = {
      greeting_msg: 'Hello World!',
      error_count: 'Errors found: %d'
    };

`new Text('greeting_msg')` would be equivalent of doing `new Text('Hello World!')`.
You can also use `printf`-like syntax, like:
* `new Text('error_count', 12)`
* `new Text('I have %d %s', 20, 'cabbages')`

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
* `profile`: `Object`, the profile as retrieved from Facebook Messenger. [See the docs][user-profile] for the most up to date information. If a profile can't be pulled, it's `{}`, otherwise, here are some of the more useful fields for quick reference:
  * `profile.first_name`: first name
  * `profile.last_name`: last name
  * `profile.profile_pic`: profile picture
* `source`: `string|undefined` A guess of where the user came from for this session:
  * `direct` TODO, not implemented yet
  * `return` A returning visitor
  * `web` Came from a "Send to Messenger" button on a website
  * `undefined` Unknown

[user-profile]: https://developers.facebook.com/docs/messenger-platform/user-profile


Session cache
-------------

If you want to customize the cache, you can supply your own cache in the
`Messenger` constructor. By default, it uses the [cacheman] memory cache, but
any cache that follows these simple patterns will work:

* `cache.get(key: string): ?Promise<Object>`
* `cache.set(key: string, value: Object): Promise<Object>`


Other APIs
---------

* `require('launch-vehicle-fbm').SESSION_TIMEOUT_MS`: This constant is available if you need some sort of magic number for what to consider a session length
* `Messenger.app`: The base Express app is available for you here


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
