'use strict';
'browser-only';

/**
 * Find and manipulate DOM nodes.
 *
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


/** @ignore */
var ElementWrapper = skit.browser.ElementWrapper;
/** @ignore */
var iter = skit.platform.iter;
/** @ignore */
var sizzle = skit.thirdparty.sizzle;


/**
 * @return {Array} An array of elements wrapped in ElementWrapper objects that
 *     match a given DOM query selector.
 */
module.exports.find = function(selector) {
  return iter.map(sizzle(selector), function(el) {
    return new ElementWrapper(el);
  });
};


/**
 * @return {ElementWrapper?} The first element that matches a given query,
 *     wrapped in an ElementWrapper object.
 */
module.exports.get = function(selector) {
  return module.exports.find(selector)[0];
};

