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
 * Create a Text ``responseObject``
 *
 * Also supports translations
 */
class Text {
  /*:: codetext: string */
  /*:: text: string */
  /*:: quick_replies: Button[] */
  /**
   * @param  {string} text Text to send
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
   * Add some quick replies to the Text response.
   * @param  {Button[]} buttons Buttons to attach
   * @return {Text} returns itself for chaining
   */
  quickReplies(buttons/*: Button[] */) {
    this.quick_replies = buttons;
    return this;
  }
}

/**
 * Create an Image ``responseObject``
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
   * Add some quick replies to the Text response.
   * @param  {Button[]} buttons Buttons to attach
   * @return {Text} returns itself for chaining
   */
  quickReplies(buttons/*: Button[] */) {
    this.quick_replies = buttons;
    return this;
  }
}

// https://developers.facebook.com/docs/messenger-platform/send-api-reference/generic-template
/**
 * Generic template
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
