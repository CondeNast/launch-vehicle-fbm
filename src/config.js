const config = require('config');

exports.config = config;

exports.getNamespaceKey = function (key, prefix = 'launch-vehicle-fbm') {
  if (prefix) {
    return [prefix, key].join('.');
  }
  return key;
};

exports.get = function (key, prefix = 'launch-vehicle-fbm') {
  return config.get(exports.getNamespaceKey(key, prefix));
};
