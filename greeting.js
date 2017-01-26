const debug = require('debug')('lenses:messenger:greeting');
const logError = require('debug')('lenses:messenger:greeting:error');
const reqPromise = require('request-promise');

const PAGE_ACCESS_TOKEN = require('config').get('messenger.pageAccessToken');

// Docs:
// https://developers.facebook.com/docs/messenger-platform/thread-settings/greeting-text
//
// You can also manage this from https://www.facebook.com/YOUR_PAGE/settings/?tab=messaging
// So we may want to just delete this to keep our codebase smaller

function addGreeting(text) {
  const options = {
    uri: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    json: {
      setting_type: 'greeting',
      greeting: {
        text
      }
    }
  };

  return reqPromise(options)
    .then((jsonObj) => {
      debug('addGreeting: %o', jsonObj);
    })
    .catch((err) => {
      logError('Failure in addGreeting: ', err);
    });
}

function removeGreeting() {
  const options = {
    uri: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    json: {
      setting_type: 'greeting'
    }
  };

  return reqPromise(options)
    .then((jsonObj) => {
      debug('removeGreeting: %o', jsonObj);
    })
    .catch((err) => {
      logError('Failure in removeGreeting: ', err);
    });
}

module.exports.set = addGreeting;
module.exports.unset = removeGreeting;
