'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var util = skit.platform.util;

// Borrowed from jQuery:parseJSON.
var rvalidchars = /^[\],:{}\s]*$/;
var rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g;
var rvalidescape = /\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g;
var rvalidtokens = /"[^"\\\r\n]*"|true|false|null|-?(?:\d+\.|)\d+(?:[eE][+-]?\d+|)/g;


return {
  parse: function(data) {
    if (typeof JSON !== 'undefined' && JSON.parse) {
      return JSON.parse( data );
    }

    if (!data || typeof data !== 'string') {
      return data;
    }

    data = util.trim(data);
    if (!data) {
      return null;
    }

    var data = data.replace(rvalidescape, '@')
        .replace(rvalidtokens, ']')
        .replace(rvalidbraces, '');

    if (!rvalidchars.test(data)) {
      throw new Error('Invalid JSON string: ' + data);
    }
    return (new Function('return ' + data))();
  }
};