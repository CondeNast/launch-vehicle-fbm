// @flow
const fs = require('fs');
const { format } = require('util');
const debug = require('debug')('messenger:responses');

const appRootDir = require('app-root-dir').get();
if (fs.existsSync(`${appRootDir}/messages.js`)) {
  // $FlowFixMe
  exports._dictionary = require(`${appRootDir}/messages.js`);
  debug('Loaded %d entries into dictionary', Object.keys(exports._dictionary).length);
} else {
  exports._dictionary = {};
  debug('Loaded empty dictionary');
}

// https://developers.facebook.com/docs/messenger-platform/send-api-reference
// In order of most -> least commonly used

/*::
declare type TextButton = { content_type: 'text', title: string, image_url?: string, payload: string }
declare type LocationButton = { content_type: 'location' }
declare type Button = TextButton | LocationButton
*/

/**
 * Create a Text response message
 *
 * ``Text`` supports `gettext <https://en.wikipedia.org/wiki/Gettext>`_-like
 * functionality if your project has a ``messages.js`` in its root. Using
 * this sample ``messages.js``::
 *
 *    module.exports = {
 *      greeting_msg: 'Hello World!',
 *      error_count: 'Errors found: %d'
 *    };
 *
 * ``new Text('greeting_msg')`` would be equivalent to ``new Text('Hello World!')``.
 *
 * You can also use `printf`-like syntax, like:
 *
 * * ``new Text('error_count', 12)``
 * * ``new Text('I have %d %s', 20, 'cabbages')``
 *
 */
class Text {
  /*:: codetext: string */
  /*:: text: string */
  /*:: quick_replies: Button[] */
  /**
   * @param {string} text Text to send
   * @param {...mixed} args Any printf substitution arguments
   */
  constructor(text/*: string */, ...args/*: mixed[] */) {
    Object.defineProperty(this, 'codetext', {
      enumerable: false, // This is the default, but here to be explicit
      value: text
    });
    const translation = exports._dictionary[text];
    let newText;
    if (translation) {
      if (Array.isArray(translation)) {
        newText = translation[0 | Math.random() * translation.length];
      } else {
        newText = translation;
      }
    } else {
      newText = text;
    }
    this.text = format(newText, ...args);
  }

  /**
   * Add quick replies to the `Text` message
   * @param  {Button[]} buttons Buttons to attach. See `quick-replies <https://developers.facebook.com/docs/messenger-platform/send-messages/quick-replies>`_
   * @return {Text} returns itself for chaining
   */
  quickReplies(buttons/*: Button[] */) {
    this.quick_replies = buttons;
    return this;
  }
}

/**
 * Create an Image response message
 */
class Image {
  /*:: attachment: Object */
  /*:: quick_replies: Button[] */
  /**
   * @param  {string} url URL of the image
   */
  constructor(url/*: string */) {
    this.attachment = {
      type: 'image',
      payload: { url }
    };
  }

  /**
   * Add quick replies to the `Image` message
   * @param  {Button[]} buttons Buttons to attach. See `quick-replies <https://developers.facebook.com/docs/messenger-platform/send-messages/quick-replies>`_
   * @return {Image} returns itself for chaining
   */
  quickReplies(buttons/*: Button[] */) {
    this.quick_replies = buttons;
    return this;
  }
}

/**
 * A `Generic template <https://developers.facebook.com/docs/messenger-platform/send-messages/template/generic>`_.
 * These are the rich elements you'll use to create interactive elements and carousels.
 * @param       {Object[]} elements Generic template elements
 * @constructor
 */
function Generic(elements/*: Object[] */) {
  this.attachment = {
    type: 'template',
    payload: {
      template_type: 'generic',
      elements: elements
    }
  };
}

// $FlowFixMe
class ImageQuickReply extends Image {
  constructor(url/*: string */, options/*: Button[] */) {
    super(url);
    this.quick_replies = options;
    console.log('DEPRECATED: ImageQuickReply is deprecated, use Image(url).quickReplies(options) instead');
  }
}


exports.Generic = Generic;
exports.Image = Image;
exports.ImageQuickReply = ImageQuickReply;
exports.Text = Text;
