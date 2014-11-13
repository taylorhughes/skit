'use strict';
'browser-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


return {
  notFound: function() {
    // TODO(taylor): Revisit this API.
    throw new Error('Not found cannot be called after page load.');
  },

  navigate: function(url) {
    document.body.className += ' navigating';
    window.location.href = url;
  },

  currentPathAndAfter: function() {
    return window.location.href.replace(window.location.protocol + '//' + window.location.host, '');
  },

  userAgent: function() {
    return window.navigator.userAgent;
  }
};
