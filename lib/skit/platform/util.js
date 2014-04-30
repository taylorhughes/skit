

var exports = {};


exports.inherits = function(childCtor, parentCtor) {
  function tempCtor() {};
  tempCtor.prototype = parentCtor.prototype;
  childCtor.superClass_ = parentCtor.prototype;
  childCtor.prototype = new tempCtor();
  childCtor.prototype.constructor = childCtor;
};


exports.createClass = function(var_args) {
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
    if (object.__init__) {
      object.__init__.apply(this, arguments);
    }
  };
  if (parent) {
    util.inherits(f, parent);
  }
  for (var k in object) {
    f.prototype[k] = object[k];
  }
  return f;
};


exports.bind = function(fn, context, var_args) {
  var args = Array.prototype.slice.call(arguments, 2);
  return function() {
    var moreArgs = Array.prototype.slice.call(arguments);
    return fn.apply(context, args.concat(moreArgs));
  };
};


return exports;
