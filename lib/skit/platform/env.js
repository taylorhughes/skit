'use strict';

/**
 * @module
 * @license
 * (c) 2016 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

/** @ignore */
var browser = __module__.browser;
/** @ignore */
var server = __module__.server;



/**
 * @param {string} name Environment key name.
 * @return {object?} The env value, if present, or null.
 */
module.exports.get = function(name) {
  // Dummy function filled in by env_browser.js or env_server.js.
};


/* JSDoc, plz to ignore this. */
module.exports = browser || server;
