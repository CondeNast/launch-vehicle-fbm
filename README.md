# Launch Vehicle FBM
An event driven SDK for Facebook Messenger chat bots.

[![license](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat)](LICENSE)

<a href="https://technology.condenast.com"><img src="https://user-images.githubusercontent.com/1215971/35070721-3f136cdc-fbac-11e7-81b4-e3aa5cc70a17.png" title="Conde Nast Technology" width=350/></a>

FBM is a full-featured, opinionated Facebook Messenger SDK for writing bots.
In addition to wrappers around the Messenger API, you get:
* A session store for storing state between messages
* Auto-populated profile information so you can address by name from anywhere
* Listeners for greetings and help text to follow best practices
* Easy to add metrics to your bot
* Support for deployment on multiple pages

## Install

`npm i launch-vehicle-fbm`

## Usage

```javascript
const { Messenger } = require('launch-vehicle-fbm');
const messenger = new Messenger(options);
messenger.start();  // Start listening
```

### Options

* `cache` (default: [cacheman] memory cache) See [Session cache](#session-cache)
* `hookPath` (default: `/webhook`)
* `pages`: A map of page ids to page access tokens `{1029384756: 'ThatsAReallyLongStringYouGotThere'}`. Currently optional but config will migrate to this in the future
* `port` (default: `3000`)
* `emitGreetings` (default: true)
  When enabled, emits common greetings as `text.greeting` events.
  When disabled, no check is run and `text` events will be emitted.
  Optionally, can be set to a `RexExp` object which will enable the option and use the specified expression instead of the built-in default.

Additional options are set via environment variables. See `example.env` for an
example.

### Endpoints
* `/webhook` (override with `options.hookPath`) -- The Messenger [webbhook](https://developers.facebook.com/docs/graph-api/webhooks)
* `/pause` -- Dashbot compatible pause for live person takeovers. See [Dashbot's docs](https://www.dashbot.io/sdk/pause) for usage. Currently, pauses only last for 12 hours in case the operator forgets to unpause

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

#### Event `data`

All events contain the following attributes in the `data`:

* `event` The raw event
* `reply: Function` Reply back to the user with the arguments
* `senderId` The ID of the sender
* `session` [A Session object](#the-session-object) you can mutate

In addition, `data` contains these attributes on specific events:

* `text` Text message
  * `source` One of `quickReply`, `postback`, `text`
  * `text` Original message content: `event.message.text` for text events and `payload` for `postback` and `quickReply` events
  * `normalizedText` Normalized message content
* `text.greeting` (optional, defaults to enabled) Text messages that match common greetings
  * `firstName` Trimmed first name from the user's public Facebook profile
  * `fullName` Concatenating of `firstName` and `surName` with a single, separating space
  * `surName` Trimmed first name from the user's public Facebook profile
* `text.help` (optional, defaults to enabled) Text messages that match requests for assistance
  * no additional attributes provided
* `message` Any kind of message event. This is sent in addition to the events for specific message types.
  * `message` Direct access to `event.message`
* `message.image` Image (both attached and from user's camera)
  * `url` Direct access to `event.message.attachments[0].payload.url` for the url of the image
* `message.quickReply` For conversation, use the `text` event, this is for the raw message sent via a quick reply button
  * `payload` Quick reply content, `event.quick_reply.payload`
* `message.thumbsup` User clicked the "thumbsup"/"like" button
  * no additional attributes provided
* `message.sticker` Sticker
  * no additional attributes provided
* `message.text` For conversation, use the `text` event
  * `text` Message content: `event.message.text`
* `message.quickReply` For conversation, use the `text` event, this is for the raw message sent via a quick reply button
  * `payload` Quick reply content: `event.quick_reply.payload`
* `postback` For conversation, use the `text` event, this is for the raw message sent via a postback
  * `payload` Postback content: `event.postback.payload`
* `referral` Fires when a user scans your [Messenger code]
  * `referral` Referral content (from Facebook):
    * `referral.ref` A custom `ref` for a parametric code
    * `referral.source` `MESSENGER_CODE`
    * `referral.type` `OPEN_THREAD`

[Messenger code]: https://developers.facebook.com/docs/messenger-platform/discovery/messenger-codes/

#### Other Events

* `app.starting` signal that the `Messenger.start` has been called and the application is in the process of coming online
* `app.started` signal that the SDK's Express server is now listening on the specified `port` and ready for requests
* `finish` (optional) Signal that you're done processing. This is mostly useful for your tests when you have Promise chains. The SDK currently does nothing
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


### The session object

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


### Session cache

If you want to customize the cache, you can supply your own cache in the
`Messenger` constructor. By default, it uses the [cacheman] memory cache, but
any cache that follows these simple patterns will work:

* `cache.get(key: string): ?Promise<Object>`
* `cache.set(key: string, value: Object): Promise<Object>`

We strongly suggest using something like Redis that will persist across
restarts. There are examples in the [wiki].

[wiki]: https://github.com/CondeNast/launch-vehicle-fbm/wiki


### Other APIs

* `require('launch-vehicle-fbm').SESSION_TIMEOUT_MS`: This constant is available if you need some sort of magic number for what to consider a session length
* `Messenger.app`: The base Express app is available for you here


### Logging and metrics

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


### Prior art

There are many other Messenger Node packages; we made a page to help you decide
if this is the appropriate one for your project:
https://github.com/CondeNast/launch-vehicle-fbm/wiki/Prior-art
