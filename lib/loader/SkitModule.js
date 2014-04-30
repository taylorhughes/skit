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


SkitModule.prototype.addFile = function(fullPath) {
  var basename = path.basename(fullPath);

  // Foo.js -> 'js'
  // Foo.html -> 'html'
  // Foo_bar.html -> 'bar.html'
  // Foo_bar.js -> 'bar'
  var nickname = basename.replace(this.name, '').replace(/^[_.]+/, '').replace(/\.js$/, '');

  this.files_[nickname] = fullPath;
};


SkitModule.prototype.getMainObject = function(callback) {
  this.getObjectNamed('js', callback);
};


SkitModule.prototype.getObjectNamed = function(name, _callback) {
  if (this.loadCallbacks_[name]) {
    this.loadCallbacks_[name].push(_callback);
    return;
  }
  this.loadCallbacks_[name] = [_callback];

  var callback = (function(err, object) {
    var callbacks = this.loadCallbacks_[name];
    delete this.loadCallbacks_[name];

    callbacks.forEach(function(cb) {
      cb(err, object);
    });
  }).bind(this);

  if (this.objects_[name]) {
    callback(null, this.objects_[name]);
    return;
  }

  console.log('Loading: ', this.toString() + ':' + name);

  var filename = this.files_[name];
  loadSkitModuleFile_(filename, this.findDependencyWithPath.bind(this), function(err, object) {
    callback(err, object);
  }.bind(this));
};


SkitModule.prototype.findDependencyWithPath = function(dependencyPath, callback) {
  // Absolute path dependency; make that file into a module real quick.
  if (dependencyPath.indexOf('/') == 0) {
    // File dependency.
    var basename = path.basename(dependencyPath);
    var dependency = new SkitModule(basename);
    dependency.addFile(dependencyPath);
    callback(null, dependency);
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

    async.map(dependencies, getDependencyNamed, function(err, results) {
      if (err) {
        callback(err);
        return;
      }

      var objectsByDependencyPath = {};
      dependencies.forEach(function(dependencyPath, i) {
        objectsByDependencyPath[dependencyPath] = results[i];
      });

      console.log('-- loading submodule:', filename);
      try {
        var object = transformer.evaluate(objectsByDependencyPath);
      } catch(e) {
        var err = new Error('Script error: ' + filename + ' (' + e + ')');
        callback(err);
        return;
      }

      callback(null, object);
    });
  });
};


module.exports = SkitModule;
