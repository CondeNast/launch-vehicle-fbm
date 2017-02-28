const { Messenger } = require('./app');
const responses = require('./responses');

exports.Messenger = Messenger;

exports.responses = responses;

exports.Text = responses.Text;
exports.Image = responses.Image;
exports.Generic = responses.Generic;
