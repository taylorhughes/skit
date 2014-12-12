'use strict';

/**
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var string = skit.platform.string;


// Borrowed from jQuery:parseJSON.
var rvalidchars = /^[\],:{}\s]*$/;
var rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g;
var rvalidescape = /\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g;
var rvalidtokens = /"[^"\\\r\n]*"|true|false|null|-?(?:\d+\.|)\d+(?:[eE][+-]?\d+|)/g;


/**
 * An implementation of JSON.parse() that works on all browsers, borrowed
 * from jQuery. Thanks jQuery!
 *
 * @param {string} data The JSON-encoded string to parse.
 * @return {Object} The parsed JavaScript object.
 */
module.exports.parse = function(data) {
  if (typeof JSON !== 'undefined' && JSON.parse) {
    return JSON.parse(data);
  }

  if (!data || typeof data !== 'string') {
    return data;
  }

  data = string.trim(data);
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
};