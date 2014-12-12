'use strict';

/**
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */



/**
 * An object with a length property that is subscriptable, like an array,
 * but which might not be derived from the Array prototype.
 *
 * @class
 * @name ArrayLike
 * @property {number} length The length of the array-like object.
 */


/**
 * Iterate over an array-like object with optional context.
 *
 * @param {ArrayLike} items The array-like object to iterate over.
 * @param {Function} fn The function to call with each item from {items}.
 * @param {Object=} opt_context The context for {this} inside {fn}.
 */
module.exports.forEach = function forEach(items, fn, opt_context) {
  var length = items.length || 0;
  var stop = false;
  var stopFn = function() {
    stop = true;
  };

  for (var i = 0; i < length && !stop; i++) {
    fn.call(opt_context, items[i], i, stopFn);
  }
};
var forEach = module.exports.forEach;


/**
 * Filter objects in {items} based on the result of {opt_fn}.
 *
 * @param {ArrayLike} items The array-like object to iterate over.
 * @param {Function=} opt_fn The function to call with each item from {items},
 *     which should return a boolean value. If not present, the truthiness of
 *     the item itself will be used.
 * @param {Object=} opt_context The context for {this} inside {opt_fn}.
 * @return {Array} A filtered array of items from {items}.
 */
module.exports.filter = function filter(items, opt_fn, opt_context) {
  var fn = opt_fn || function(item) { return !!item };
  var array = [];
  forEach(items, function(item, i) {
    if (fn.call(opt_context, item, i)) {
      array.push(item);
    }
  });
  return array;
};


/**
 * Map objects in {items} to new values supplied by {fn}.
 *
 * @param {ArrayLike} items The array-like object to iterate over.
 * @param {Function} fn The function to call with each item from {items},
 *     which should return a new object.
 * @param {Object=} opt_context The context for {this} inside {fn}.
 * @return {Array} The mapped values from {items}.
 */
module.exports.map = function map(items, fn, opt_context) {
  var array = [];
  var skip = false;
  var shouldSkip = function() {
    skip = true;
  };
  forEach(items, function(item, i) {
    var mapped = fn.call(opt_context, item, i, shouldSkip);
    if (!skip) {
      array.push(mapped);
    }
    skip = false;
  });
  return array;
};


/**
 * @param {ArrayLike} array The array to iterate over.
 * @param {Object} item The object to find.
 * @return Whether {array} contains {item}, using == to compare objects.
 */
module.exports.contains = function contains(array, item) {
  if (!array || !array.length) {
    return false;
  }

  for (var i = 0; i < array.length; i++) {
    if (array[i] == item) {
      return true;
    }
  }
  return false;
};


/**
 * @param {ArrayLike} array The array to iterate over.
 * @param {Function} fn The function to call with each item from {items},
 *     which should return whether the item matches.
 * @param {Object=} opt_context The context for {this} inside {fn}.
 * @return {number} The index of the item inside {array} if {fn} returned true
 *     for any of the elements, or -1.
 */
module.exports.indexOf = function indexOf(array, fn, opt_context) {
  for (var i = 0; i < array.length; i++) {
    var item = array[i];
    if (fn.call(opt_context, item)) {
      return i;
    }
  }
  return -1;
};


/**
 * @param {ArrayLike} array The array to iterate over.
 * @param {Function} fn The function to call with each item from {items},
 *     which should return whether the item matches.
 * @param {Object=} opt_context The context for {this} inside {fn}.
 * @return {Object?} The item that {fn} returned true for, if any.
 */
module.exports.find = function find(array, fn, opt_context) {
  return array[module.exports.indexOf(array, fn, opt_context)];
};


/**
 * Convert an array-like object to an Array.
 *
 * @param {ArrayLike} nonArray The non-array to convert.
 * @return {Array} The nonArray object as an Array.
 */
module.exports.toArray = function toArray(nonArray) {
  var result = [];
  var length = nonArray.length || 0;
  for (var i = 0; i < length; i++) {
    result.push(nonArray[i]);
  }
  return result;
};
