'use strict';

var path = require('path');
var util = require('util');

var Handlebars = require('handlebars');


function SourceTransformer(source) {
  this.source = source;
}
module.exports.SourceTransformer = SourceTransformer;

SourceTransformer.prototype.findDependencies = function() {
  return [];
};

SourceTransformer.prototype.functionStringWithDependencies = function(dependencyList) {
  return '(function(){})';
};

SourceTransformer.prototype.evaluate = function(dependencyMap) {
  var values = [];
  var dependencyList = [];
  for (var dependencyPath in dependencyMap) {
    var obj = dependencyMap[dependencyPath];
    dependencyList.push(dependencyPath);
    values.push(obj);
  }

  var functionString = this.functionStringWithDependencies(dependencyList);
  var result = eval(functionString).apply({}, values);
  return result;
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
    // 'use strict';
    var result = /^['"].+['"];?$/.exec(line);
    if (result) {
      return true;
    }

    var result = /^var\s+\w+\s*=\s*([\w.]+)\s*;?$/.exec(line);
    if (!result) {
      return false;
    }

    dependencies[result[1]] = 1;
    return true;
  });

  var dependencyPaths = Object.keys(dependencies);
  return dependencyPaths;
};

JavaScriptSourceTransformer.prototype.functionStringWithDependencies = function(dependencyList) {
  var source = this.source;

  var aliases = [];
  for (var i = 0; i < dependencyList.length; i++) {
    var dependencyPath = dependencyList[i];
    var alias = dependencyPath.replace(/[^a-zA-Z0-9_]/g, '_') + '_' + (+new Date());

    // Replace all foo.bar with foo_bar_12345 aliases.
    source = source.split(dependencyPath).join(alias);

    aliases.push(alias);
  }

  // Build a function with the given source, using aliases as arguments.
  // Then call the function with the actual objects in the correct order.
  var functionDefinition = '(function(' + aliases.join(',') + ') { ' + source + ' })';
  return functionDefinition;
};


function HandlebarsSourceTransformer() {
  SourceTransformer.apply(this, arguments);
}
util.inherits(HandlebarsSourceTransformer, SourceTransformer);

HandlebarsSourceTransformer.prototype.findDependencies = function() {
  var handlebarsLib = path.dirname(require.resolve('handlebars'));
  var runtimeDist = path.resolve(handlebarsLib, '..', 'dist/handlebars.runtime.js');
  return [runtimeDist];
};

HandlebarsSourceTransformer.prototype.functionStringWithDependencies = function() {
  var template = Handlebars.precompile(this.source);
  var wrapped = [
    '(function(Handlebars) {',
    '  return Handlebars.VM.template(' + template + ', Handlebars);',
    '})'].join('\n');
  return wrapped;
};

HandlebarsSourceTransformer.prototype.evaluate = function(dependencyMap) {
  var functionString = this.functionStringWithDependencies();
  var result = eval(functionString).apply({}, [Handlebars]);
  return result;
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
setTransformer('.html', HandlebarsSourceTransformer);

