'use strict';
'server-only';

/**
 * @module
 * @ignore
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


// TODO(taylor): Make this more generic.
var lastUrl = null;
var redirected = false;
var notFound = false;
var userAgent = false;

module.exports = {
  __reset__: function(currentUrl, ua) {
    lastUrl = currentUrl;
    userAgent = ua;
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
    redirected = lastUrl != url;
    lastUrl = url;
  },

  currentPathAndAfter: function() {
    return lastUrl;
  },

  userAgent: function() {
    return userAgent;
  }
};
