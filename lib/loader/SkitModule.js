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


SkitModule.prototype.getObjectNamed = function(name, callback) {
  this.load_(function(err) {
    if (err) {
      callback(err, null);
      return;
    }

    var object = this.objects_[name];
    console.log(this.toString(), 'loaded', name, 'object:', typeof main);
    callback(null, object);
  }.bind(this));
};


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

  var callback = (function(err) {
    var callbacks = this.loadCallbacks_;
    delete this.loadCallbacks_;
    callbacks.forEach(function(cb) {
      cb(err);
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
      callback(wrappedErr);
      return;
    }

    var nicknameDependencyTree = new NamedNode();
    var nicknameNodesByName = {};

    var transformersByNickname = {};
    files.forEach(function(filename, i) {
      var nickname = nicknames[i];
      // This is a Buffer object.
      var source = sources[i].toString();

      var extension = path.extname(filename);
      var TransformerKlass = transformers.getTransformer(extension);
      transformersByNickname[nickname] = new TransformerKlass(source);

      nicknameNodesByName[nickname] = new NamedNode(nickname);
      nicknameDependencyTree.addChildNode(nicknameNodesByName[nickname]);
    });

    var root = this.root();
    var dependenciesByPath = {};
    for (var nickname in transformersByNickname) {
      var transformer = transformersByNickname[nickname];
      var dependencies = transformer.findDependencies();

      for (var i = 0; i < dependencies.length; i++) {
        var dependencyPath = dependencies[i];
        var components = dependencyPath.split('.');
        if (components[0] == '__module__') {
          var dependencyNickname = components.slice(1).join('.');
          if (!(dependencyNickname in nicknameNodesByName)) {
            var options = Object.keys(nicknameNodesByName).join(', ');
            var err = new Error('Inner-module dependency not found: ' + dependencyNickname +
                ' in script: ' + this.files_[nickname] + ' options: ' + options);
            callback(err);
            return;
          }

          var parent = nicknameNodesByName[nickname];
          var child = nicknameNodesByName[dependencyNickname];
          if (parent.order() >= child.order()) {
            parent.addChildNode(child);
            try {
              parent.order();
            } catch(e) {
              var err = new Error('Cyclical inner-module dependency: ' + dependencyNickname +
                  ' in script: ' + this.files_[nickname]);
              callback(err);
              return;
            }
          }
        } else {
          var dependency = root.findNodeWithPath(components);
          if (!dependency) {
            var err = new Error('Invalid dependency: ' + dependencyPath + ' in script: ' + this.files_[nickname]);
            callback(err);
            return;
          }
          dependenciesByPath[dependencyPath] = dependency;
        }
      };
    };

    console.log('dependency tree:', JSON.stringify(nicknameDependencyTree));

    var loadModule = function(dependencyPath, mapDone) {
      dependenciesByPath[dependencyPath].getMainObject(mapDone);
    }.bind(this);

    var dependenciesToLoad = Object.keys(dependenciesByPath);
    async.map(dependenciesToLoad, loadModule, function(err, results) {
      if (err) {
        callback(err);
        return;
      }

      var objectsByDependencyPath = {};
      dependenciesToLoad.forEach(function(dependencyPath, i) {
        objectsByDependencyPath[dependencyPath] = results[i];
      });

      var loadOrderNicknames = nicknameDependencyTree.allChildren().map(function(child) {
        return child.name;
      });

      var objectsByScriptNickname = {};
      for (var i = 0; i < loadOrderNicknames.length; i++) {
        var nickname = loadOrderNicknames[i];
        console.log('-- loading submodule:', nickname);
        var transformer = transformersByNickname[nickname];
        try {
          objectsByScriptNickname[nickname] = transformer.evaluate(objectsByDependencyPath);
        } catch(e) {
          var err = new Error('Script error: ' + this.files_[nickname] + ' (' + e + ')');
          callback(err);
          return;
        }
        // These are ordered such that dependent modules get loaded earlier.
        objectsByDependencyPath['__module__.' + nickname] = objectsByScriptNickname[nickname];
      };

      this.objects_ = objectsByScriptNickname;
      callback(null);

    }.bind(this));
  }.bind(this));
};


module.exports = SkitModule;
