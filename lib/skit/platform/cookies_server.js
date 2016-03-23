'use strict';
'server-only';

/**
 * @module
 * @ignore
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var util = skit.platform.util;

var _get, _set;


module.exports = {
  __setGetSet__: function(get, set) {
    _get = get;
    _set = set;
  },

  get: function() {
    var value = _get.apply(this, arguments);
    if (value) {
      return decodeURIComponent(value);
    }
    return value;
  },

  set: function(name, value, opt_options) {
    var options = opt_options || {};
    for (var k in options) {
      if (['path', 'domain', 'expires', 'secure', 'httpOnly'].indexOf(k) < 0) {
        throw new Error('Unsupported cookies.set option: ' + k);
      }
    }
    if (typeof options.httpOnly == 'undefined') {
      // To match client- and server-side behavior, unless specified,
      // don't default to "httponly" cookies. This is less secure,
      // but also way less confusing.
      options.httpOnly = false;
    }
    if (value) {
      // Cookies library on the client side URI-encodes values,
      // so copy that behavior here.
      value = (value + '').replace(/[^!#$&-+\--:<-\[\]-~]/g, encodeURIComponent);
    }
    return _set.call(this, name, value, options);
  }
};
