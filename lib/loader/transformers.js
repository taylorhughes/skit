'use strict';

var util = require('util');


function SourceTransformer(source) {
  this.source = source;
}
module.exports.SourceTransformer = SourceTransformer;

SourceTransformer.prototype.findDependencies = function() {
  return {};
};

SourceTransformer.prototype.evaluate = function(dependencyMap) {
  return null;
};


var JavaScriptSourceTransformer = function() {
  SourceTransformer.apply(this, arguments);
};
util.inherits(JavaScriptSourceTransformer, SourceTransformer);

JavaScriptSourceTransformer.prototype.findDependencies = function() {
  var dependencies = {};

  var source = this.source.replace(/^\s*\/\/.*$/, '');
  source = source.replace(/^\/\*.+?\*\//m, '');
  source.split(/[\n\r]+/).every(function(line) {
    line = line.trim();
    if (!line) {
      return true;
    }
    var result = /^var\s+\w+\s*=\s*([\w.]+)\s*;?$/.exec(line);
    if (!result) {
      return false;
    }

    dependencies[result[1]] = 1;
    return true;
  });

  return Object.keys(dependencies);
};

JavaScriptSourceTransformer.prototype.evaluate = function(dependencyMap) {
  var source = this.source;

  var aliases = [];
  var values = [];
  for (var dependencyPath in dependencyMap) {
    var alias = dependencyPath.replace(/\./g, '_') + '_' + (+new Date());
    var obj = dependencyMap[dependencyPath];

    // Replace all foo.bar with foo_bar_12345 aliases.
    source = source.split(dependencyPath).join(alias);

    aliases.push(alias);
    values.push(obj);
  }

  // Build a function with the given source, using aliases as arguments.
  // Then call the function with the actual objects in the correct order.
  var wrapped = '(function(' + aliases.join(',') + ') { ' + source + ' })';
  var result = eval(wrapped).apply(null, values);
  return result;
};


function MustacheSourceTransformer() {
  SourceTransformer.apply(this, arguments);
}
util.inherits(MustacheSourceTransformer, SourceTransformer);

MustacheSourceTransformer.prototype.evaluate = function(dependencyMap) {
  var wrapped = '(function() { return ' + JSON.stringify(this.source) + '})';
  return eval(wrapped);
};



var TRANSFORMERS = {};


function setTransformer(extension, fn) {
  TRANSFORMERS[extension] = fn;
}
module.exports.setTransformer = setTransformer;


function getTransformer(extension) {
  return TRANSFORMERS[extension] || SourceTransformer;
}
module.exports.getTransformer = getTransformer;


setTransformer('.js', JavaScriptSourceTransformer);
setTransformer('.html', MustacheSourceTransformer);

