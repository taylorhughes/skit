'use strict';
'browser-only';

/**
 * @module
 * @ignore
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


module.exports = {
  notFound: function() {
    // TODO(taylor): Revisit this API.
    throw new Error('Not found cannot be called after page load.');
  },

  navigate: function(url, opt_permanent) {
    document.body.className += ' navigating';
    window.location.href = url;
  },

  url: function() {
    return window.location.href;
  },

  userAgent: function() {
    return window.navigator.userAgent;
  },

  referer: function() {
    return document.referrer;
  }
};
