'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var exports = {};


var inherits = function(childCtor, parentCtor) {
  function tempCtor() {};
  tempCtor.prototype = parentCtor.prototype;
  childCtor.superClass_ = parentCtor.prototype;
  childCtor.prototype = new tempCtor();
  childCtor.prototype.constructor = childCtor;
};
exports.inherits = inherits;


var createClass = function(var_args) {
  var parent = function() {};
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
    inherits(f, parent);
  }
  for (var k in object) {
    f.prototype[k] = object[k];
  }
  return f;
};
exports.createClass = createClass;


var bind = function(fn, context, var_args) {
  var args = Array.prototype.slice.call(arguments, 2);
  return function() {
    var moreArgs = Array.prototype.slice.call(arguments);
    return fn.apply(context, args.concat(moreArgs));
  };
};
exports.bind = bind;


var forEach = function(items, fn, opt_context) {
  var length = items.length || 0;
  var stop = false;
  var stopFn = function() {
    stop = true;
  };

  for (var i = 0; i < length && !stop; i++) {
    fn.call(opt_context, items[i], i, stopFn);
  }
};
exports.forEach = forEach;


var filter = function(items, opt_fn, opt_context) {
  var fn = opt_fn || function(item) { return !!item };
  var array = [];
  forEach(items, function(item, i) {
    if (fn.call(opt_context, item, i)) {
      array.push(item);
    }
  });
  return array;
};
exports.filter = filter;


var map = function(items, fn, opt_context) {
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
exports.map = map;


var toArray = function(nonArray) {
  var result = [];
  var length = nonArray.length || 0;
  for (var i = 0; i < length; i++) {
    result.push(nonArray[i]);
  }
  return result;
};
exports.toArray = toArray;


var trim = function(str) {
  return (str || '').replace(/^\s+|\s+$/g, '');
};
exports.trim = trim;


var capitalize = function(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
};
exports.capitalize = capitalize;


var camelCase = function(str) {
  var substrs = str.split('-');
  var first = substrs[0];
  substrs = map(substrs.slice(1), function(substr) {
    return capitalize(substr);
  });
  return [first].concat(substrs).join('');
};
exports.camelCase = camelCase;


var escapeHtml = function(str) {
  return str && str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
};
exports.escapeHtml = escapeHtml;


var escapeRegex = function(str) {
  if (!str) { return str; }
  return str.replace(/[\[\]\/\\{}()*+?.^$|-]/g, '\\$&');
};
exports.escapeRegex = escapeRegex;


var hasConsoleLog = false;
try {
  hasConsoleLog = !!(typeof console != 'undefined' && console.log && console.log.apply);
} catch (e) {}

var log = function(var_args) {
  if (hasConsoleLog) {
    console.log.apply(console, arguments);
  }
};
exports.log = log;


return exports;
