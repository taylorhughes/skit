'use strict';

var fs = require('fs');
var path = require('path');
var util = require('util');

var async = require('async');

var NamedNode = require('./NamedNode');
var transformers = require('./transformers');


function SkitModule(name) {
  NamedNode.call(this, name);
  this.files_ = {};
  this.objects_ = {};
  this.loadCallbacks_ = {};
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
    throw new Error('Invalid module file, does not match module name.');
  }
  var nickname = basename.replace(this.name, '').replace(/^[_.]+/, '').replace(/\.js$/, '');

  this.files_[nickname] = fullPath;
};


SkitModule.LOADED_TRANSFORMERS_IN_ORDER = null;
SkitModule.prototype.getMainObject = function(callback) {
  var mainNickname = 'js';
  if (!(mainNickname in this.files_)) {
    mainNickname = Object.keys(this.files_)[0];
  }
  this.getObjectNamed(mainNickname, callback);
};


SkitModule.prototype.getObjectNamed = function(name, _callback) {
  if (this.objects_[name]) {
    _callback(null, this.objects_[name].cached);
    return;
  }

  var myPath = this.nodePath().join('.') + ':' + name;
  if (this.loadCallbacks_[name]) {
    console.log('not calling back for', myPath, 'immediately');
    this.loadCallbacks_[name].push(_callback);
    return;
  }
  this.loadCallbacks_[name] = [_callback];

  var ownsLoadOrder = false;
  if (!SkitModule.LOADED_TRANSFORMERS_IN_ORDER) {
    SkitModule.LOADED_TRANSFORMERS_IN_ORDER = [];
    ownsLoadOrder = true;
  }

  var callback = (function(err, object) {
    var callbacks = this.loadCallbacks_[name];
    delete this.loadCallbacks_[name];

    callbacks.forEach(function(cb) {
      cb(err, object, SkitModule.LOADED_TRANSFORMERS_IN_ORDER);
    });

    if (ownsLoadOrder) {
      SkitModule.LOADED_TRANSFORMERS_IN_ORDER = null;
    }
  }).bind(this);

  if (!(name in this.files_)) {
    var err = new Error('Invalid object name: ' + name + ', files: ' + JSON.stringify(this.files_));
    callback(err);
    return;
  }

  console.log('Loading:', myPath);

  var filename = this.files_[name];
  loadSkitModuleFile_(myPath, filename, this.findDependencyWithPath.bind(this), function(err, object) {
    this.objects_[name] = {cached: object};
    callback(err, object);
  }.bind(this));
};


SkitModule.prototype.findDependencyWithPath = function(dependencyPath, callback) {
  // Absolute path dependency; make that file into a module real quick.
  if (dependencyPath.indexOf('/') == 0) {
    // File dependency.
    var moduleName = SkitModule.moduleName(dependencyPath);
    var dependency = new SkitModule(moduleName);
    dependency.addFile(dependencyPath);
    dependency.getMainObject(callback);
    return;
  }

  // Inner-module dependency; load that file first.
  var components = dependencyPath.split('.');
  if (components[0] == '__module__') {
    var depNickname = components.slice(1).join('.');
    this.getObjectNamed(depNickname, callback);
    return;
  }

  // Dependency in another module -- find its main object.
  var dependency = this.root().findNodeWithPath(components);
  if (!dependency) {
    var err = new Error('Invalid dependency: ' + dependencyPath +
        ' in script: ' + this.files_[nickname]);
    callback(err);
    return;
  }

  dependency.getMainObject(callback);
};


function loadSkitModuleFile_(myPath, filename, getDependencyNamed, callback) {
  console.log('opening:', myPath, filename);
  fs.readFile(filename, function(err, source) {
    if (err) {
      var wrappedErr = new Error('Could not read file: ' + err);
      callback(wrappedErr);
      return;
    }

    var extension = path.extname(filename);
    var TransformerKlass = transformers.getTransformer(extension);
    var transformer = new TransformerKlass(source.toString());

    var dependenciesByPath = {};
    var dependencies = transformer.findDependencies();

    async.map(dependencies, getDependencyNamed, function(err, results) {
      if (err) {
        callback(err);
        return;
      }

      var objectsByDependencyPath = {};
      dependencies.forEach(function(dependencyPath, i) {
        objectsByDependencyPath[dependencyPath] = results[i];
      });

      console.log('-- evaluating submodule:', filename);
      try {
        var object = transformer.evaluate(objectsByDependencyPath);
      } catch(e) {
        var err = new Error('Script error: ' + filename + ' (' + e + ')');
        callback(err);
        return;
      }

      SkitModule.LOADED_TRANSFORMERS_IN_ORDER.push({
        path: myPath,
        dependencies: dependencies,
        transformer: transformer
      });

      callback(null, object);
    });
  });
};


module.exports = SkitModule;
