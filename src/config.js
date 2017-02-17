const config = require('config');

exports.config = config;

exports.get = function (key, prefix = 'launch-vehicle-fbm.') {
  if (prefix) {
    key = `${prefix}${key}`;
  }
  return config.get(key);
};
