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


function ScriptResource(filePath, modulePath, source) {
  this.filePath = filePath;
  this.modulePath = modulePath;
  this.source = source;
}
module.exports.ScriptResource = ScriptResource;

ScriptResource.prototype.getRelativeDependencyPaths = function() {
  if (!this.relativeDependencyPaths_) {
    this.relativeDependencyPaths_ = this.findDependencyPaths_();
  }
  return this.relativeDependencyPaths_;
};

ScriptResource.prototype.getAbsoluteDependencyPaths = function() {
  return this.absoluteDependencyPaths_;
};
ScriptResource.prototype.setAbsoluteDependencyPaths = function(paths) {
  this.absoluteDependencyPaths_ = paths;
};

ScriptResource.prototype.getFunctionStringTracebackOffset = function() {
  return 0;
};

ScriptResource.prototype.getFunctionString = function() {
  if (!this.functionString_) {
    this.functionString_ = this.buildFunctionString_();
  }
  return this.functionString_;
};

ScriptResource.prototype.findDependencyPaths_ = function() {
  // TO OVERRIDE.
  return [];
};

ScriptResource.prototype.buildFunctionString_ = function() {
  // TO OVERRIDE.
  return '(function(){})';
};

ScriptResource.prototype.includeInEnvironment = function(targetEnvironment) {
  // TO OVERRIDE.
  return true;
};


var JavaScriptResource = function(filePath, modulePath, source) {
  ScriptResource.call(this, filePath, modulePath, source);

  var parsedBody = this.getParsedBody();

  this.serverOnly_ = false;
  this.browserOnly_ = false;

  for (var i = 0; i < parsedBody.length; i++) {
    var node = parsedBody[i];
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
};
util.inherits(JavaScriptResource, ScriptResource);

JavaScriptResource.prototype.getParsedBody = function() {
  if (!this.parsed_) {
    this.parsed_ = Reflect.parse(this.source);
  }
  return this.parsed_.body;
};

JavaScriptResource.prototype.includeInEnvironment = function(environment) {
  if (this.browserOnly_) {
    return environment == TargetEnvironment.BROWSER;
  }

  if (this.serverOnly_) {
    return environment == TargetEnvironment.SERVER;
  }

  return true;
};

JavaScriptResource.prototype.findDependencyPaths_ = function() {
  var dependencies = [];

  var body = this.getParsedBody();
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
    var gotAny = false;
    for (var j = 0; j < declarations.length; j++) {
      var declaration = declarations[j];
      if (!declaration.init || declaration.init.type != 'MemberExpression') {
        continue;
      }

      var range = declaration.init.range;
      var dependency = this.source.substring(range[0], range[1]);
      dependencies.push(dependency);
      gotAny = true;
    }

    if (!gotAny) {
      break;
    }
  }

  return dependencies;
};

var regexEscape = function(str) {
  return str.replace(/[\[\]\/\\{}()*+?.^$|-]/g, '\\$&');
};

JavaScriptResource.prototype.getFunctionStringTracebackOffset = function() {
  // This is the number of lines above the actual function body,
  // appended below in buildFunctionString_();
  return 9;
};

JavaScriptResource.prototype.buildFunctionString_ = function() {
  var source = this.source;
  var depList = this.getRelativeDependencyPaths();

  var aliases = [];
  for (var i = 0; i < depList.length; i++) {
    var dependencyPath = depList[i];
    var alias = dependencyPath.replace(/[^a-zA-Z0-9_]/g, '_') + '_' + (+new Date());

    // Replace all foo.bar with foo_bar_12345 aliases, but only when
    // we know for sure it's an assignment situation.
    var regex = new RegExp('=\\s*' + regexEscape(dependencyPath) + '(?=\\s*(?:[,;]|$))', 'g');
    source = source.split(regex).join('= ' + alias);

    aliases.push(alias);
  }

  var body = this.getParsedBody();
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

  source = [
    "var module = {exports: null};",
    "var __defined__ = null;",
    "function define() {",
    "  for (var i = 0; i < arguments.length; i++) {",
    "    if (typeof arguments[i] == 'function') { __defined__ = arguments[i](); break; }",
    "  }",
    "}",
    "define.amd = true;",

    "var result = (function " + this.modulePath.replace(/[^\w]/g,'_') + "() {",
    source,
    "})();",

    "return result || __defined__ || module.exports;",
  ].join('\n');

  // Build a function with the given source, using aliases as arguments.
  // Then call the function with the actual objects in the correct order.
  var functionDefinition = '(function(' + aliases.join(',') + ') { ' + source + ' })';
  return functionDefinition;
};


function HandlebarsResource() {
  ScriptResource.apply(this, arguments);
}
util.inherits(HandlebarsResource, ScriptResource);

HandlebarsResource.HANDLEBARS_MODULE = 'skit.thirdparty.handlebars';

HandlebarsResource.prototype.findDependencyPaths_ = function() {
  var deps = [HandlebarsResource.HANDLEBARS_MODULE];

  var source = this.source;
  var matcher = /\{\{>\s*([\w.]+)/g;
  var result;
  while (result = matcher.exec(source)) {
    deps.push(result[1]);
  }

  return deps;
};

HandlebarsResource.prototype.buildFunctionString_ = function() {
  var source = this.source;
  var depList = this.getRelativeDependencyPaths();

  var args = [];
  var partials = [];
  depList.forEach(function(dependencyPath) {
    if (dependencyPath == HandlebarsResource.HANDLEBARS_MODULE) {
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

