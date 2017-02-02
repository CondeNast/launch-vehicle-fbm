// https://developers.facebook.com/docs/messenger-platform/send-api-reference
// In order of most -> least commonly used

function Text(text) {
  this.text = text;
}

function Image(url) {
  this.attachment = {
    type: 'image',
    payload: {
      url
    }
  };
}

class ImageQuickReply extends Image {
  // I'm not sure how accurate "quick reply" objects are yet, but this is
  // needed for quiz questions
  constructor(url, options) {
    super(url);
    this.quick_replies = options;
  }
}

// https://developers.facebook.com/docs/messenger-platform/send-api-reference/generic-template
function Generic(elements) {
  this.attachment = {
    type: 'template',
    payload: {
      template_type: 'generic',
      elements: elements
    }
  };
}


exports.Generic = Generic;
exports.Image = Image;
exports.ImageQuickReply = ImageQuickReply;
exports.Text = Text;
