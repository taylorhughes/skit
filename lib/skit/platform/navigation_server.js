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
var redirects = null;
var notFound = false;
var userAgent = false;
var referer = null;


module.exports = {
  __reset__: function(_currentUrl, _userAgent, _referer) {
    lastUrl = _currentUrl;
    userAgent = _userAgent;
    referer = _referer;

    notFound = false;
    redirects = [];
  },

  __redirects__: function() {
    return redirects;
  },

  __notfound__: function() {
    return notFound;
  },

  notFound: function() {
    notFound = true;
  },

  navigate: function(url, opt_permanent) {
    if (!lastUrl) {
      throw new Error('Cannot navigate before the request has begun.');
    }

    var newFullUrl;
    var parsed = urls.parse(lastUrl);
    var newParsed = urls.parse(url);
    if (newParsed.scheme) {
      newFullUrl = url;
    } else {
      var newPathParts = newParsed.path.split('/');
      if (newPathParts[0] != '') {
        var oldPathParts = parsed.path.split('/');
        newPathParts = oldPathParts.slice(0, oldPathParts.length - 1).concat(newPathParts);
      }
      newFullUrl = parsed.scheme + '://' + parsed.host + newPathParts.join('/');
      if (newParsed.params) {
        newFullUrl = urls.appendParams(newFullUrl, newParsed.params);
      }
      if (newParsed.hash) {
        newFullUrl += '#' + newParsed.hash;
      }
    }

    if (lastUrl != newFullUrl) {
      redirects.push({
        url: newFullUrl,
        permanent: !!opt_permanent
      });
    }

    lastUrl = newFullUrl;
  },

  url: function() {
    if (!lastUrl) {
      throw new Error('Cannot access the current URL before the request has begun.');
    }

    return lastUrl;
  },

  userAgent: function() {
    return userAgent;
  },

  referer: function() {
    return referer;
  }
};
