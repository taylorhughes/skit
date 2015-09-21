'use strict';

/**
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var urls = skit.platform.urls;

/** @ignore */
var browser = __module__.browser;
/** @ignore */
var server = __module__.server;
/** @ignore */
var navigation = browser || server;


/**
 * Called during __preload__ to indicate that a given URL should return a
 * 404 not found rather than going on to load the full page.
 */
module.exports.notFound = function() {
  return navigation.notFound();
};


/**
 * Called during __preload__ or anywhere in the page lifecycle to indicate
 * that we should navigate to a new URL. Use this instead of calling
 * document.location.href = to make server-side 302's and client-side
 * navigation work.
 *
 * @param {string} url The URL to navigate to.
 * @param {boolean=} opt_permanent Whether to issue a permanent redirect,
 *     ie. a 301, rather than a temporary redirect.
 */
module.exports.navigate = function(url, opt_permanent) {
  return navigation.navigate(url, opt_permanent);
};


/**
 * @return {string} The current User-Agent, corresponding to the "User-Agent"
 *     header on the server side or window.navigator.userAgent in the browser.
 */
module.exports.userAgent = function() {
  return navigation.userAgent();
};


/**
 * @return {string} The URL of this page's referer.
 */
module.exports.referer = function() {
  return navigation.referer();
};


/**
 * @return {string} The current URL, eg. "http://foobar.com/index.html?foo=bar#baz".
 */
module.exports.url = function() {
  return navigation.url();
};


/**
 * @return {string} The URL of this page's referer.
 */
module.exports.host = function() {
  return urls.parse(navigation.url()).host;
};


/**
 * @return {boolean} Whether the current URL is HTTPS.
 */
module.exports.isSecure = function() {
  return urls.parse(navigation.url()).scheme == 'https';
};


/**
 * @return {string} The current URL, eg. "/index.html?foo=bar#baz".
 */
module.exports.relativeUrl = function() {
  var fullUrl = navigation.url();
  var parsed = urls.parse(fullUrl);
  var relativeUrl = urls.appendParams(parsed.path, parsed.params)
  if (parsed.hash) {
    relativeUrl += '#' + parsed.hash;
  }
  return relativeUrl;
};


/**
 * @return {Object} The URL query parsed into an Object, eg. {'foo': 'bar'}.
 */
module.exports.query = function() {
  return urls.parse(navigation.url()).params;
};
