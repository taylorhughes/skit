'use strict';

/**
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var browser = __module__.browser;
var server = __module__.server;


/**
 * @class
 * @name CookieOptions
 * @property {Date} expires The date when the cookie should expire.
 * @property {string} path The path to set the cookie on.
 * @property {string} domain The domain to set the cookie on.
 * @property {boolean} secure Whether the cookie should only be sent over SSL.
 */

/**
 *
 * @return {string?} The cookie value, if it was present.
 */
module.exports.get = function(name) {
  // Dummy function filled in by cookies_browser.js or cookies_server.js.
};


/**
 * Set a cookie.
 *
 * @param {string} name The name of the cookie to set.
 * @param {string} value The value of the cookie to set.
 * @param {CookieOptions=} opt_options The cookie objects object to set along with the cookie.
 */
module.exports.set = function(name, value, opt_options) {
  // Dummy function filled in by cookies_browser.js or cookies_server.js.
};


/* JSDoc, plz to ignore this. */
module.exports = browser || server;
