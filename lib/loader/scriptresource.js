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


var TargetEnvironment = {
  BROWSER: 'browser',
  SERVER: 'server'
};
module.exports.TargetEnvironment = TargetEnvironment;


function ScriptResource(modulePath, source) {
  this.modulePath = modulePath;
  this.dependencyPaths_ = this.findDependencyPaths_(source);
  this.functionString_ = this.buildFunctionString_(source, this.dependencyPaths_);
}
module.exports.ScriptResource = ScriptResource;

ScriptResource.prototype.getRelativeDependencyPaths = function() {
  return this.dependencyPaths_;
};

ScriptResource.prototype.getAbsoluteDependencyPaths = function() {
  return this.absoluteDependencyPaths_;
};
ScriptResource.prototype.setAbsoluteDependencyPaths = function(paths) {
  this.absoluteDependencyPaths_ = paths;
};

ScriptResource.prototype.getFunctionString = function() {
  return this.functionString_;
};

ScriptResource.prototype.findDependencyPaths_ = function(source) {
  // TO OVERRIDE.
  return [];
};

ScriptResource.prototype.buildFunctionString_ = function(source, dependencyList) {
  // TO OVERRIDE.
  return '(function(){})';
};

ScriptResource.prototype.includeInEnvironment = function(targetEnvironment) {
  // TO OVERRIDE.
  return true;
};


var JavaScriptResource = function(modulePath, source) {
  this.parsed = Reflect.parse(source);

  this.serverOnly_ = false;
  this.browserOnly_ = false;

  var body = this.parsed.body;
  for (var i = 0; i < body.length; i++) {
    var node = body[i];
    if (node.type == 'ExpressionStatement' && node.expression.type == 'Literal') {
      var value = node.expression.value;
      if (value === 'server-only') {
        this.serverOnly_ = true;
      } else if (value === 'browser-only') {
        this.browserOnly_ = true;
      }
    } else {
      break;
    }
  }

  ScriptResource.call(this, modulePath, source);
};
util.inherits(JavaScriptResource, ScriptResource);

JavaScriptResource.prototype.includeInEnvironment = function(environment) {
  if (this.browserOnly_) {
    return environment == TargetEnvironment.BROWSER;
  }

  if (this.serverOnly_) {
    return environment == TargetEnvironment.SERVER;
  }

  return true;
};

JavaScriptResource.prototype.findDependencyPaths_ = function(source) {
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
      if (!declaration.init || declaration.init.type != 'MemberExpression') {
        continue;
      }

      var range = declaration.init.range;
      var dependency = source.substring(range[0], range[1]);
      dependencies.push(dependency);
    }
  }

  return dependencies;
};

JavaScriptResource.prototype.buildFunctionString_ = function(source, depList) {
  var aliases = [];
  for (var i = 0; i < depList.length; i++) {
    var dependencyPath = depList[i];
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

  delete this.parsed;

  // Build a function with the given source, using aliases as arguments.
  // Then call the function with the actual objects in the correct order.
  var functionDefinition = '(function(' + aliases.join(',') + ') { ' + source + ' })';
  return functionDefinition;
};


function HandlebarsResource() {
  ScriptResource.apply(this, arguments);
}
util.inherits(HandlebarsResource, ScriptResource);

HandlebarsResource.prototype.findDependencyPaths_ = function(source) {
  var handlebarsLib = path.dirname(require.resolve('handlebars'));
  var runtimeDist = path.resolve(handlebarsLib, '..', 'dist/handlebars.runtime.js');
  var deps = [runtimeDist];

  var result = /\{\{>\s*([\w.]+)/g.exec(source);
  if (result) {
    var results = Array.prototype.slice.call(result, 1);
    deps = deps.concat(results);
  }

  return deps;
};

HandlebarsResource.prototype.buildFunctionString_ = function(source, depList) {
  var args = [];
  var partials = [];
  depList.forEach(function(dependencyPath) {
    if (dependencyPath.indexOf('/') == 0) {
      args.push('Handlebars');
    } else {
      var alias = dependencyPath.replace(/[^a-zA-Z0-9_]/g, '_') + '_' + (+new Date());
      source = source.split(dependencyPath).join(alias);
      partials.push(alias);
      args.push(alias);
    }
  });

  // Don't look at me that way. I know. I KNOW!
  var partialDeclarations = partials.map(function(alias) {
    return JSON.stringify(alias) + ': ' + alias;
  });
  var partialMapString = '{' + partialDeclarations.join(',') + '}';

  var template = Handlebars.precompile(source);
  var wrapped = [
    '(function(' + args.join(',') + ') {',
    '  var template = Handlebars.VM.template(' + template + ', Handlebars);',
    '  var partials = ' + partialMapString + ';' +
    '  return function(context, opt_options) {',
    '    var options = opt_options || {};',
    '    options.partials = partials;',
    '    return template(context, options);',
    '  }',
    '})'].join('\n');
  return wrapped;
};



var RESOURCE_WRAPPERS = {};


function setResourceWrapper(extension, fn) {
  RESOURCE_WRAPPERS[extension] = fn;
}
module.exports.setResourceWrapper = setResourceWrapper;


function getResourceWrapper(extension) {
  return RESOURCE_WRAPPERS[extension] || null;
}
module.exports.getResourceWrapper = getResourceWrapper;


setResourceWrapper('.js', JavaScriptResource);
setResourceWrapper('.html', HandlebarsResource);

