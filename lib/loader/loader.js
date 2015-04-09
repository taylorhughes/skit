'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var path = require('path');
var fs = require('fs');

var NamedNode = require('./NamedNode');
var SkitModule = require('./SkitModule');
var pooledmoduleloader = require('./pooledmoduleloader');


function walkSync(dir) {
  var remaining = 1;

  var filePaths = [];
  var paths = fs.readdirSync(dir);
  paths.forEach(function(pathToTest) {
    pathToTest = dir + path.sep + pathToTest;
    var stat = fs.statSync(pathToTest);
    if (stat.isDirectory()) {
      var paths = walkSync(pathToTest);
      paths.forEach(function(file) {
        filePaths.push(file);
      });
    } else {
      filePaths.push(pathToTest);
    }
  });
  return filePaths;
}
module.exports.walkSync = walkSync;


function mkdirPSync(dir) {
  // 'taylor' to '/home/taylor' to ['home', 'taylor']
  var parts = path.normalize(dir).split(path.sep);

  for (var i = 0; i < parts.length; i++) {
    var currentPath =  parts.slice(0, i + 1).join(path.sep) || path.sep;
    currentPath = path.normalize(currentPath);

    try {
      fs.mkdirSync(currentPath);
    } catch (e) {
      if (e.code != 'EEXIST' && e.code != 'EISDIR') {
        throw e;
      }
    }
  }
}
module.exports.mkdirPSync = mkdirPSync;


function buildModuleTree(rootPath, opt_rootName) {
  var root = new NamedNode(opt_rootName);

  var realPath = fs.realpathSync(rootPath);
  var files = walkSync(realPath);

  files.forEach(function(file) {
    var relativePath = file.replace(realPath + path.sep, '');
    if (relativePath.indexOf('__') == 0) {
      // continue
      return;
    }

    var basename = path.basename(relativePath);
    if (basename.substring(0, 1) == '.') {
      // continue
      return;
    }

    var dirname = path.dirname(relativePath);
    var parent = root;
    if (dirname != '.') {
      dirname.split(path.sep).forEach(function(component) {
        var child = parent.getChildWithName(component);
        if (!child) {
          var child = new NamedNode(component);
          parent.addChildNode(child);
        }
        parent = child;
      });
    }

    var moduleName = SkitModule.moduleName(file);
    var moduleNode = parent.getChildWithName(moduleName);
    if (!moduleNode) {
      var modulePath = parent.nodePath().concat([moduleName]).join('.');
      moduleNode = new SkitModule(moduleName, modulePath);
      parent.addChildNode(moduleNode);
    }

    try {
      moduleNode.addFile(file);
    } catch (e) {
      e.fileName = file;
      throw e;
    }
  });

  return root;
}
module.exports.buildModuleTree = buildModuleTree;


var __skitTree__ = null;
function globalScopedLoaderForModule(modulePath, cb) {
  if (!__skitTree__) {
    __skitTree__ = new NamedNode('root');
    __skitTree__.addChildNode(loadSkitTree());

    pooledmoduleloader.setPoolSize('global', 10);
  }
  var module = __skitTree__.findNodeWithPath(modulePath);
  
  pooledmoduleloader.borrowModuleScope('global', module, function(scope) {
    cb(scope);
  });
}
module.exports.globalScopedLoaderForModule = globalScopedLoaderForModule;


function loadSkitTree() {
  // Note that this shouldn't be cached, since a tree in memory can only
  // belong to a single parent, and we take this tree and add it to
  // a different tree in load() below.
  var skitPath = path.resolve(__dirname, '..', 'skit');
  console.log('[skit] Loading skit in: ' + skitPath);
  return buildModuleTree(skitPath, 'skit');
}
module.exports.loadSkitTree = loadSkitTree;
