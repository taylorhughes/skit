'use strict';

/**
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

/** @ignore */
var browser = __module__.browser;
/** @ignore */
var server = __module__.server;


/**
 * Called during __preload__ to indicate that a given URL should return a
 * 404 not found rather than going on to load the full page.
 */
module.exports.notFound = function() {
  // Stub method filled in by navigation_browser.js and navigation_server.js.
};


/**
 * Called during __preload__ or anywhere in the page lifecycle to indicate
 * that we should navigate to a new URL. Use this instead of calling
 * document.location.href = to make server-side 302's and client-side
 * navigation work.
 *
 * @param {string} url The URL to navigate to.
 */
module.exports.navigate = function(url) {
  // Stub method filled in by navigation_browser.js and navigation_server.js.
};


/**
 * @return {string} The current URL, eg. "/index.html?foo=bar#baz".
 */
module.exports.currentPathAndAfter = function() {
  // Stub method filled in by navigation_browser.js and navigation_server.js.
};


/**
 * @return {string} The current User-Agent, corresponding to the "User-Agent"
 *     header on the server side or window.navigator.userAgent in the browser.
 */
module.exports.userAgent = function() {
  // Stub method filled in by navigation_browser.js and navigation_server.js.
};


// JSDoc ignore this plz.
module.exports = browser || server;
