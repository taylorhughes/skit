'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var toFormEncodedString = function(params) {
  var pairs = [];
  for (var key in params) {
    pairs.push(escape(key) + '=' + encodeURIComponent('' + params[key]));
  }
  return pairs.join('&');
};


var parse = function(url) {
  var preAndPostHash = url.split('#');
  var hash = preAndPostHash[1] || null;
  var pathAndQuerystring = preAndPostHash[0].split('?');
  var querystring = pathAndQuerystring[1] || '';
  var path = pathAndQuerystring[0];

  var scheme = null;
  var host = null;
  var port = null;
  if (path.indexOf('/') > 0) {
    var schemeHostAndPath = path.match(/^([A-Za-z]+):\/\/([^\/:]+)(?:\:(\d+))?(\/.+)$/);
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
      var value = split[1];
      params[decodeURIComponent(split[0])] = value ? decodeURIComponent(value) : value;
    }
  }

  return {scheme: scheme, host: host, port: port, path: path, hash: hash, params: params};
};


var appendParams = function(url, params) {
  var parsed = parse(url);

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
    newUrl = parsed.scheme + '://' + parsed.host + (parsed.port ? ':' + parsed.port : '') + newUrl;
  }

  return newUrl;
};


return {
  parse: parse,
  appendParams: appendParams,
  toFormEncodedString: toFormEncodedString
};
