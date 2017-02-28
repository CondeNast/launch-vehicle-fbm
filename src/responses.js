// @flow
const fs = require('fs');
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

class Text {
  /*:: codetext: string */
  /*:: text: string */
  // TODO printf support so you can do new Text('You answered %d', count)
  // https://nodejs.org/docs/latest/api/util.html#util_util_format_format_args
  constructor(text/*: string */) {
    Object.defineProperty(this, 'codetext', {
      enumerable: false,  // This is the default, but here to be explicit
      value: text
    });
    const translation = exports._dictionary[text];
    if (translation) {
      if (Array.isArray(translation)) {
        this.text = translation[0 | Math.random() * translation.length];
      } else {
        this.text = translation;
      }
    } else {
      this.text = text;
    }
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
  constructor(url/*: string */, options/*: Object[] */) {
    super(url);
    this.quick_replies = options;
  }
}


exports.Generic = Generic;
exports.Image = Image;
exports.ImageQuickReply = ImageQuickReply;
exports.Text = Text;
