'use strict';
'server-only';

/**
 * @module
 * @ignore
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var urls = skit.platform.urls;

var lastUrl = null;
var redirected = false;
var notFound = false;
var userAgent = false;
var referer = null;


module.exports = {
  __reset__: function(_currentUrl, _userAgent, _referer) {
    lastUrl = _currentUrl;
    userAgent = _userAgent;
    referer = _referer;

    notFound = false;
    redirected = false;
  },

  __redirect__: function() {
    if (redirected) {
      return lastUrl;
    }
  },

  __notfound__: function() {
    return notFound;
  },

  notFound: function() {
    notFound = true;
  },

  navigate: function(url) {
    var newFullUrl;
    var parsed = urls.parse(lastUrl);
    var newParsed = urls.parse(url);
    if (newParsed.scheme) {
      newFullUrl = url;
    } else {
      var newPathParts = parsed.path.split('/');
      if (newPathParts[0] != '') {
        newPathParts = newPathParts.slice(0, newPathParts.length - 1);
        newPathParts.push(url);
      }
      newFullUrl = parsed.scheme + '://' + parsed.host + newPathParts.join('/');
    }

    redirected = lastUrl != newFullUrl;
    lastUrl = url;
  },

  url: function() {
    return lastUrl;
  },

  userAgent: function() {
    return userAgent;
  },

  referer: function() {
    return referer;
  }
};
