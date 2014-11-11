'use strict';
'server-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


// TODO(taylor): Make this more generic.
var lastUrl = null;
var redirected = false;
var notFound = false;

return {
  __reset__: function(currentUrl) {
    lastUrl = currentUrl;
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
    console.log('current url: ', lastUrl);
    return lastUrl;
  }
};
