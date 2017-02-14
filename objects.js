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
exports.Text = Text;
