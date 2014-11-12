'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var fs = require('fs');
var path = require('path');
var util = require('util');

var async = require('async');

var NamedNode = require('./NamedNode');
var scriptresource = require('./scriptresource');
var styleresource = require('./styleresource');
var TargetEnvironment = scriptresource.TargetEnvironment;


function SkitModule(name, modulePath) {
  NamedNode.call(this, name);
  this.modulePath = modulePath;

  this.scripts_ = {};
  this.styles_ = {};
}
util.inherits(SkitModule, NamedNode);


SkitModule.moduleName = function(fullPath) {
  var basename = path.basename(fullPath);
  // Foo.js, Foo_bar.js, Foo.bar.js, Foo_bar.bz.js -> all belong to the "Foo" module.
  var moduleName = basename.split('.').slice(0, 1)[0];
  return moduleName.split('_').slice(0, 1)[0];
};


SkitModule.prototype.addFile = function(fullPath) {
  var basename = path.basename(fullPath);

  // Foo.js -> 'js'
  // Foo.html -> 'html'
  // Foo_bar.html -> 'bar.html'
  // Foo_bar.js -> 'bar'
  if (basename.indexOf(this.name) != 0) {
    var err = new Error('Invalid module file, does not match module name: ' + this.name);
    err.fileName = fullPath;
    throw err;
  }
  var nickname = basename.replace(this.name, '').replace(/^[_.]+/, '').replace(/\.js$/, '');

  var extension = path.extname(fullPath);
  var isStyle = false;
  var ResourceKlass = scriptresource.getResourceWrapper(extension);
  if (!ResourceKlass) {
    isStyle = true;
    ResourceKlass = styleresource.getResourceWrapper(extension);
  }

  if (!ResourceKlass) {
    var err = new Error('Invalid resource -- could not identify wrapper: ' + fullPath);
    err.fileName = fullPath;
    throw err;
  }

  var source = fs.readFileSync(fullPath).toString();
  var modulePath = this.modulePath + ':' + nickname;
  var resource = new ResourceKlass(fullPath, modulePath, source);

  if (isStyle) {
    this.styles_[nickname] = resource;
  } else {
    this.scripts_[nickname] = resource;
  }
};


SkitModule.prototype.getResourceNamed = function(name) {
  return this.scripts_[name] || this.styles_[name];
};


SkitModule.prototype.buildResourceList = function() {
  var mainNickname = 'js';
  if (!(mainNickname in this.scripts_)) {
    mainNickname = Object.keys(this.scripts_)[0];
  }

  var alwaysInclude = this.buildAlwaysIncludeResourceList_();
  if (mainNickname) {
    var resourcesList = this.buildResourceListForScriptNamed_(mainNickname);
    Array.prototype.splice.apply(resourcesList, [-1, 0].concat(alwaysInclude));
    return resourcesList;
  } else {
    return alwaysInclude;
  }
};


SkitModule.prototype.buildAlwaysIncludeResourceList_ = function() {
  return Object.keys(this.styles_).map(function(k) { return this.styles_[k]; }, this);
};


SkitModule.prototype.buildResourceListForScriptNamed_ = function(name) {
  var loaded = {};
  var all = [];

  var scriptResource = this.scripts_[name];
  if (!scriptResource) {
    throw new Error('Invalid reference to submodule "' + name + '" in module ' + this.modulePath);
  }

  var relativeDependencies = scriptResource.getRelativeDependencyPaths();
  var absoluteDependencies = [];

  relativeDependencies.forEach(function(dependencyPath) {
    var resources = this.getResourceListForRelativeDependency_(dependencyPath);
    if (!resources) {
      throw new Error('Invalid dependency: "' + dependencyPath + '" in module: ' + this.modulePath + ':' + name);
    }

    var absoluteDependency = resources[resources.length - 1];
    absoluteDependencies.push(absoluteDependency.modulePath);

    resources.forEach(function(resource) {
      if (resource.modulePath in loaded) {
        // continue
        return;
      }

      loaded[resource.modulePath] = true;
      all.push(resource);
    });
  }, this);

  all.push(scriptResource);
  scriptResource.setAbsoluteDependencyPaths(absoluteDependencies);

  return all;
};


SkitModule.prototype.getResourceListForRelativeDependency_ = function(relativePath) {
  // Inner-module dependency; load that file first.
  if (relativePath.indexOf('__module__.') == 0) {
    var depNickname = relativePath.replace('__module__.', '');
    return this.buildResourceListForScriptNamed_(depNickname);
  }

  // Dependency in another module -- find its main object.
  var dependency = this.root().findNodeWithPath(relativePath);
  if (!dependency || !dependency.buildResourceList) {
    return null;
  }

  return dependency.buildResourceList();
};


module.exports = SkitModule;
