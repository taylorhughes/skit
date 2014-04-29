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
}
util.inherits(SkitModule, NamedNode);


SkitModule.prototype.addFile = function(fullPath) {
  var basename = path.basename(fullPath);
  var nickname = basename.replace(this.name, '').replace(/^_+/, '');

  this.files_[nickname] = fullPath;
};


SkitModule.prototype.getMainObject = function(callback) {
  this.load_(function(err) {
    if (err) {
      callback(err, null);
      return;
    }

    var objects = this.objects_;
    var keys = Object.keys(objects).filter(function(nickname) {
      return nickname.match(/\.js$/);
    });
    var mainNickname = keys.sort()[0];
    var main = objects[mainNickname];

    console.log('[', this.toString(), '] loaded main object:', typeof main, '(', mainNickname, 'of:', keys, ')');

    callback(null, main);
  }.bind(this));
}


SkitModule.prototype.load_ = function(_callback) {
  if (this.objects_) {
    _callback(null);
    return;
  }

  if (this.loadCallbacks_) {
    this.loadCallbacks_.push(_callback);
    return;
  }
  this.loadCallbacks_ = [_callback];

  var callback = (function(err, result) {
    var callbacks = this.loadCallbacks_;
    delete this.loadCallbacks_;
    callbacks.forEach(function(cb) {
      cb(err, result);
    });
  }).bind(this);

  console.log('Loading: ', this.toString());

  var files = [];
  var nicknames = [];
  for (var nickname in this.files_) {
    var file = this.files_[nickname];
    files.push(file);
    nicknames.push(nickname);
  }

  async.map(files, fs.readFile, function(err, sources) {
    if (err) {
      var wrappedErr = new Error('Could not read file: ' + err);
      callback(wrappedErr, null);
      return;
    }

    var transformersByNickname = {};
    files.forEach(function(filename, i) {
      var nickname = nicknames[i];
      // This is a Buffer object.
      var source = sources[i].toString();

      var extension = path.extname(filename);
      var TransformerKlass = transformers.getTransformer(extension);
      transformersByNickname[nickname] = new TransformerKlass(source);
    });

    var root = this.root();
    var dependenciesByPath = {};
    for (var nickname in transformersByNickname) {
      var transformer = transformersByNickname[nickname];
      var dependencies = transformer.findDependencies();

      for (var i = 0; i < dependencies.length; i++) {
        var dependencyPath = dependencies[i];
        var dependency = root.findNodeWithPath(dependencyPath.split('.'));
        if (!dependency) {
          var err = new Error('Invalid dependency: ' + dependencyPath + ' in script: ' + this.files_[nickname]);
          callback(err);
          return;
        }
        dependenciesByPath[dependencyPath] = dependency;
      };
    };

    var mainObjectsByDependencyPath = {};
    var loadModule = function(dependencyPath, asyncNext) {
      dependenciesByPath[dependencyPath].getMainObject(function(err, object) {
        mainObjectsByDependencyPath[dependencyPath] = object;
        asyncNext();
      });
    };

    async.each(Object.keys(dependenciesByPath), loadModule, function(err, results) {
      if (err) {
        callback(err);
        return;
      }

      var objectsByScriptNickname = {};
      for (var nickname in transformersByNickname) {
        var transformer = transformersByNickname[nickname];
        try {
          objectsByScriptNickname[nickname] = transformer.evaluate(mainObjectsByDependencyPath);
        } catch(e) {
          var err = new Error('Script error: ' + this.files_[nickname] + ' (' + e + ')');
          callback(err);
          return;
        }
      };

      this.objects_ = objectsByScriptNickname;
      callback(null);

    }.bind(this));
  }.bind(this));
};


SkitModule.prototype.toJSON = function() {
  var result = NamedNode.prototype.toJSON.call(this);
  result['__files__'] = Object.values(this.files_);
  return result;
};


module.exports = SkitModule;
