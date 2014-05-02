'use strict';

var fs = require('fs');
var path = require('path');
var util = require('util');

var async = require('async');

var NamedNode = require('./NamedNode');
var transformers = require('./transformers');


function SkitModule(name, dependencyPath) {
  NamedNode.call(this, name);
  this.dependencyPath = dependencyPath;
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


SkitModule.LOADED_FILES_IN_ORDER = null;


SkitModule.beginRecordingLoadedFiles = function() {
  SkitModule.LOADED_FILES_IN_ORDER = [];
};


SkitModule.getLoadedFiles = function() {
  var modules = SkitModule.LOADED_FILES_IN_ORDER;
  if (modules) {
    return modules.slice();
  }
  return [];
};


SkitModule.prototype.getMainObject = function(callback) {
  var mainNickname = 'js';
  if (!(mainNickname in this.files_)) {
    mainNickname = Object.keys(this.files_)[0];
  }
  this.getObjectNamed(mainNickname, callback);
};


SkitModule.prototype.getObjectNamed = function(name, _callback) {
  var dependencyPath = this.dependencyPath + ':' + name;

  if (this.objects_[name]) {
    _callback(null, this.objects_[name].cached, dependencyPath);
    return;
  }

  if (this.loadCallbacks_[name]) {
    this.loadCallbacks_[name].push(_callback);
    return;
  }
  this.loadCallbacks_[name] = [_callback];

  var callback = (function(err, object) {
    var callbacks = this.loadCallbacks_[name];
    delete this.loadCallbacks_[name];

    callbacks.forEach(function(cb) {
      cb(err, object, dependencyPath);
    });
  }).bind(this);

  if (!(name in this.files_)) {
    var err = new Error('Invalid object name: ' + name + ', files: ' + JSON.stringify(this.files_));
    callback(err);
    return;
  }

  console.log('Loading:', dependencyPath);

  var filename = this.files_[name];
  var boundFindDep = this.findDependencyWithPath.bind(this);
  loadSkitModuleFile_(filename, boundFindDep, function(err, object, dependencies, transformer) {
    this.objects_[name] = {cached: object};

    if (SkitModule.LOADED_FILES_IN_ORDER) {
      SkitModule.LOADED_FILES_IN_ORDER.push({
        path: dependencyPath,
        dependencies: dependencies,
        transformer: transformer
      });
    }

    console.log('Loaded:', dependencyPath)

    callback(err, object);
  }.bind(this));
};


SkitModule.FILE_MODULE_CACHE = {};


SkitModule.prototype.findDependencyWithPath = function(dependencyPath, callback) {
  // Absolute path dependency; make that file into a module real quick.
  if (dependencyPath.indexOf('/') == 0) {
    // File dependency -- wrap it with a module named after this file.
    var filePath = dependencyPath;

    if (!(filePath in SkitModule.FILE_MODULE_CACHE)) {
      var moduleName = SkitModule.moduleName(filePath);
      var dependency = new SkitModule(moduleName, filePath);
      dependency.addFile(filePath);
      SkitModule.FILE_MODULE_CACHE[filePath] = dependency;
    }

    SkitModule.FILE_MODULE_CACHE[filePath].getMainObject(callback);
    return;
  }

  // Inner-module dependency; load that file first.
  if (dependencyPath.indexOf('__module__.') == 0) {
    var depNickname = dependencyPath.replace('__module__.', '');
    this.getObjectNamed(depNickname, callback);
    return;
  }

  // Dependency in another module -- find its main object.
  var dependency = this.root().findNodeWithPath(dependencyPath);
  if (!dependency) {
    var err = new Error('Invalid dependency: ' + dependencyPath +
        ' in script: ' + this.files_[nickname]);
    callback(err);
    return;
  }

  dependency.getMainObject(callback);
};


function loadSkitModuleFile_(filename, getDependencyNamed, callback) {
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

    var getDependencyNamedWrapped = function(dependencyPath, done) {
      getDependencyNamed(dependencyPath, function(err, object, dependencyPath) {
        done(err, [dependencyPath, object]);
      });
    };

    async.map(dependencies, getDependencyNamedWrapped, function(err, results) {
      if (err) {
        callback(err);
        return;
      }

      var objectsByDependencyPath = {};
      var localDependenciesToFullDependencyPaths = {};
      dependencies.forEach(function(dependencyPath, i) {
        var fullDependencyPath = results[i][0];
        localDependenciesToFullDependencyPaths[dependencyPath] = fullDependencyPath;

        var object = results[i][1];
        objectsByDependencyPath[dependencyPath] = object;
      });

      console.log('-- evaluating file:', filename);
      try {
        var object = transformer.evaluate(objectsByDependencyPath);
      } catch(e) {
        var err = new Error('Script error: ' + filename + ' (' + e + ')');
        callback(err);
        return;
      }

      callback(null, object, localDependenciesToFullDependencyPaths, transformer);
    });
  });
};


module.exports = SkitModule;
