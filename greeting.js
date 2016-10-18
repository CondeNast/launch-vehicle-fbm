const request = require('request');
const debug = require('debug')('lenses:messenger:greeting');
const logError = require('debug')('lenses:messenger:greeting:error');

const { PAGE_ACCESS_TOKEN } = require('./config');

// Docs:
// https://developers.facebook.com/docs/messenger-platform/thread-settings/greeting-text
//
// You can also manage this from https://www.facebook.com/YOUR_PAGE/settings/?tab=messaging
// So we may want to just delete this to keep our codebase smaller

function addGreeting(text) {
  return request.post({
    uri: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    json: {
      setting_type: 'greeting',
      greeting: {
        text
      }
    }
  }, (err, data) => {
    if (err) {
      logError(err);
    } else {
      debug('addGreeting: %o', data);
    }
  });
}

function removeGreeting() {
  return request.post({
    uri: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    json: {
      setting_type: 'greeting'
    }
  }, (err, data) => {
    if (err) {
      logError(err);
    } else {
      debug('removeGreeting: %o', data);
    }
  });
}

module.exports.set = addGreeting;
module.exports.unset = removeGreeting;
