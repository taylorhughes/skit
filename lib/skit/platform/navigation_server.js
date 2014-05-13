'use strict';
'server-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


// TODO(taylor): Make this more generic.
var lastUrl = null;
var notFound = false;

return {
  __reset__: function() {
    lastUrl = null;
    notFound = false;
  },
  __redirect__: function() {
    return lastUrl;
  },
  __notfound__: function() {
    return notFound;
  },

  notFound: function() {
    notFound = true;
  },

  navigate: function(url) {
    lastUrl = url;
  }
};
