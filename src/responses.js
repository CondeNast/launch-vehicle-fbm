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

/*::
declare type Button = Object
*/

// https://developers.facebook.com/docs/messenger-platform/send-api-reference
// In order of most -> least commonly used

class Text {
  /*:: codetext: string */
  /*:: text: string */
  /*:: quick_replies: Button[] */
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
    return this;
  }

  quickReplies(buttons/*: Button[] */) {
    this.quick_replies = buttons;
    return this;
  }
}

function Image(url/*: string */) {
  this.attachment = {
    type: 'image',
    payload: {
      url
    }
  };
}

// https://developers.facebook.com/docs/messenger-platform/send-api-reference/generic-template
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
  }
}


exports.Generic = Generic;
exports.Image = Image;
exports.ImageQuickReply = ImageQuickReply;
exports.Text = Text;
