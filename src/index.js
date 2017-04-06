const { Messenger, SESSION_TIMEOUT_MS } = require('./app');
const responses = require('./responses');

exports.SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MS;
exports.Messenger = Messenger;

exports.responses = responses;

exports.Generic = responses.Generic;
exports.Image = responses.Image;
exports.ImageQuickReply = responses.ImageQuickReply;
exports.Text = responses.Text;
