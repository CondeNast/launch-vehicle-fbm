const { Messenger } = require('./app');
const responses = require('./responses');

exports.Messenger = Messenger;

exports.responses = responses;

exports.Generic = responses.Generic;
exports.Image = responses.Image;
exports.ImageQuickReply = responses.ImageQuickReply;
exports.Text = responses.Text;
