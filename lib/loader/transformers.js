'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var path = require('path');
var util = require('util');

var Handlebars = require('handlebars');
var Reflect = require('reflect');


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

  this.parsed = Reflect.parse(this.source);
};
util.inherits(JavaScriptSourceTransformer, SourceTransformer);

JavaScriptSourceTransformer.prototype.findDependencies = function() {
  var dependencies = [];

  var body = this.parsed.body;
  for (var i = 0; i < body.length; i++) {
    var node = body[i];
    if (node.type != 'VariableDeclaration') {
      // Allows for 'use strict';
      if (node.type == 'ExpressionStatement' && node.expression.type == 'Literal') {
        continue;
      } else {
        break;
      }
    }

    var declarations = node.declarations;
    for (var j = 0; j < declarations.length; j++) {
      var declaration = declarations[j];
      if (declaration.init.type != 'MemberExpression') {
        continue;
      }

      var range = declaration.init.range;
      var dependency = this.source.substring(range[0], range[1]);
      dependencies.push(dependency);
    }
  }

  return dependencies;
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

  var body = this.parsed.body;
  if (body.length) {
    var lastNode = body[body.length - 1];
    if (lastNode.type != 'ReturnStatement') {
      for (var i = body.length - 1; i >= 0; i--) {
        if (body[i].type == 'VariableDeclaration') {
          source += '; return ' + body[i].declarations[0].id.name + ';';
          break;
        }
      }
    }
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

