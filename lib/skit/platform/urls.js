'use strict';

/**
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


/**
 * @param {string} str A querystring component, eg. "foo%20bar" or "foo+bar".
 * @return {string} An unescaped string, eg. "foo bar"
 */
function decodeQuerystringComponent(str) {
  if (!str) {
    return str;
  }

  return decodeURIComponent(str.replace(/\+/g, ' '));
}


/**
 * Convert an object of keys/values to a form-encoded string, eg.
 * {'a': 'b=c', 'd': 'e'} => 'a=b%26c&d=e'.
 *
 * @param {Object} params The object of keys/values to encode. Nesting of
 *     objects is not supported and will have unexpected results.
 * @return {string} The form-encoded string.
 */
module.exports.toFormEncodedString = function toFormEncodedString(params) {
  var pairs = [];
  for (var key in params) {
    pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent('' + params[key]));
  }
  return pairs.join('&');
};


/**
 * The result returned by urls.parse().
 * @class
 * @name UriInformation
 * @property {string} scheme "http" for "http://www.ex.com:80/abc?d=e#f=g"
 * @property {string} host "www.ex.com" for "http://www.ex.com:80/abc?d=e#f=g"
 * @property {number?} port 80 for "http://www.ex.com:80/abc?d=e#f=g", null
 *     if not specified.
 * @property {string} path "/abc" for "http://www.ex.com:80/abc?d=e#f=g"
 * @property {string?} hash "f=g" for "http://www.ex.com:80/abc?d=e#f=g"
 * @property {Object} params {d: 'e'} for "http://www.ex.com:80/abc?d=e#f=g"
 */


/**
 * Parses a URL into its component parts.
 *
 * @param {string} url The URL to parse.
 * @return {UriInformation} The parsed result.
 */
module.exports.parse = function parse(url) {
  var preAndPostHash = url.split('#');
  var hash = preAndPostHash[1] || null;
  var pathAndQuerystring = preAndPostHash[0].split('?');
  var querystring = pathAndQuerystring[1] || '';
  var path = pathAndQuerystring[0];

  var scheme = null;
  var host = null;
  var port = null;
  if (path.indexOf('/') > 0) {
    var schemeHostAndPath = path.match(/^([A-Za-z]+):\/\/([^\/:]+(?:\:(\d+))?)(\/.*)?$/);
    if (schemeHostAndPath) {
      scheme = schemeHostAndPath[1];
      host = schemeHostAndPath[2];
      port = schemeHostAndPath[3] || null;
      if (port) {
        port = parseInt(port, 10);
      }
      path = schemeHostAndPath[4];
    }
  }

  var existingPairs = querystring.split('&');
  var params = {};
  for (var i = 0; i < existingPairs.length; i++) {
    var split = existingPairs[i].split('=');
    if (split[0].length) {
      params[decodeQuerystringComponent(split[0])] = decodeQuerystringComponent(split[1]);
    }
  }

  return {scheme: scheme, host: host, port: port, path: path, hash: hash, params: params};
};


/**
 * Given a base URL, append the parameters to the end of the URL. Updates
 * existing params to the new values specified in {params}.
 *
 * @param {string} url A URL, eg. "/index.html?a=b"
 * @param {Object} params The params to append, eg. {'a': 'c'}.
 * @return {string} The URL with the params appended, eg. "/index.html?a=c"
 */
module.exports.appendParams = function appendParams(url, params) {
  var parsed = module.exports.parse(url);

  var newParams = parsed.params;
  for (var key in params) {
    if (params[key] === null) {
      delete newParams[key];
    } else {
      newParams[key] = params[key];
    }
  }

  var newPairs = [];
  for (var key in newParams) {
    var value = newParams[key];
    newPairs.push(encodeURIComponent(key) + (typeof value != 'undefined' ? '=' + encodeURIComponent(value) : ''));
  }
  var newQuerystring = newPairs.join('&');

  var newUrl = parsed.path;
  if (newQuerystring.length) {
    newUrl += '?' + newQuerystring;
  }
  if (parsed.hash && parsed.hash.length) {
    newUrl += '#' + parsed.hash;
  }
  if (parsed.scheme && parsed.host) {
    newUrl = parsed.scheme + '://' + parsed.host + newUrl;
  }

  return newUrl;
};
