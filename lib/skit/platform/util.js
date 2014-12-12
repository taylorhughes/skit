'use strict';

/**
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */



/**
 * Setup a class to inherit from another class.
 *
 * @param {Function} childCtor The child constructor function.
 * @param {Function} parentCtor The parent constructor function.
 */
module.exports.inherits = function inherits(childCtor, parentCtor) {
  function tempCtor() {};
  tempCtor.prototype = parentCtor.prototype;
  childCtor.superClass_ = parentCtor.prototype;
  childCtor.prototype = new tempCtor();
  childCtor.prototype.constructor = childCtor;
};


/**
 * Create a constructor function from the given object keys. If the first
 * parameter is a Function, it will become the parent constructor for this
 * class. If the __init__ member exists in the given object, it will be called
 * when the object is created.
 *
 * @param {Function} parent The parent class constructor. If the first
 *     parameter is not a function, it will be used as {object}.
 * @param {Object} object The object whose member properties will become
 *     the prototype members of the resulting class.
 */
module.exports.createClass = function createClass(parent, object) {
  var parent = null;
  var object;
  var parentOrObject = arguments[0];
  if (typeof parentOrObject == 'function') {
    parent = parentOrObject;
    object = arguments[1];
  } else {
    object = parentOrObject;
  }

  if (!object) {
    throw new Error('Supply an object that optionally defines __init__.');
  }

  var f = function() {
    if (this.__init__) {
      this.__init__.apply(this, arguments);
    }
  };
  if (parent) {
    module.exports.inherits(f, parent);
  }
  for (var k in object) {
    f.prototype[k] = object[k];
  }
  return f;
};


/**
 * Bind {this} to the given context inside {fn}.
 *
 * @param {Function} fn The function to bind.
 * @param {Object} context The object to bind as {this} inside {fn}.
 * @param {...Object} var_args The arguments to bind after {this}.
 */
module.exports.bind = function bind(fn, context, var_args) {
  var args = Array.prototype.slice.call(arguments, 2);
  return function() {
    var moreArgs = Array.prototype.slice.call(arguments);
    return fn.apply(context, args.concat(moreArgs));
  };
};


var hasConsoleLog = false;
try {
  hasConsoleLog = !!(typeof console != 'undefined' && console.log && console.log.apply);
} catch (e) {}


/**
 * In environments that support console.log(), call it with the given
 * arguments. Otherwise, do nothing.
 *
 * @param {...Object} var_args The arguments to pass to console.log().
 */
module.exports.log = function log(var_args) {
  if (hasConsoleLog) {
    console.log.apply(console, arguments);
  }
};


/**
 * Call setTimeout with an optional opt_context.
 *
 * @param {Function} fn The function to call after the timeout.
 * @param {number} time The time in milliseconds to wait before calling {fn}.
 * @param {Object=} opt_context The context for {this} inside {fn}.
 */
module.exports.setTimeout = function(fn, time, opt_context) {
  return setTimeout(function() {
    fn.apply(opt_context, arguments);
  }, time);
};


/**
 * Call a function as soon as possible in the given opt_context.
 *
 * @param {Function} fn The function to call after the timeout.
 * @param {Object=} opt_context The context for {this} inside {fn}.
 */
module.exports.nextTick = function nextTick(fn, opt_context) {
  return module.exports.setTimeout(fn, 0, opt_context);
};
