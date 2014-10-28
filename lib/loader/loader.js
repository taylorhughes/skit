'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var path = require('path');
var fs = require('fs');

var SkitModule = require('./SkitModule');
var NamedNode = require('./NamedNode');


function walkSync(dir) {
  var remaining = 1;

  var filePaths = [];
  var paths = fs.readdirSync(dir);
  paths.forEach(function(path) {
    path = dir + '/' + path;
    var stat = fs.statSync(path);
    if (stat.isDirectory()) {
      var paths = walkSync(path);
      paths.forEach(function(file) {
        filePaths.push(file);
      });
    } else {
      filePaths.push(path);
    }
  });
  return filePaths;
}
module.exports.walkSync = walkSync;


function mkdirPSync(dir) {
  // 'taylor' to '/home/taylor' to ['home', 'taylor']
  var parts = path.resolve(dir).split('/').slice(1);
  if (dir.charAt(dir.length - 1) == '/') {
    parts = parts.slice(0, -1);
  }

  var precheck = parts.join('/');
  try {
    // If this already exists, don't bother with the whole walking thing.
    fs.statSync(precheck);
    return;
  } catch (e) {}

  for (var i = 0; i < parts.length; i++) {
    var currentPath = '/' + parts.slice(0, i + 1).join('/');
    try {
      fs.statSync(currentPath);
    } catch (e) {
      if (e.code != 'ENOENT') {
        throw e;
      }
      fs.mkdirSync(currentPath);
    }
  }
}
module.exports.mkdirPSync = mkdirPSync;


function buildModuleTree(rootPath, opt_rootName) {
  var root = new NamedNode(opt_rootName);

  var realPath = fs.realpathSync(rootPath);
  var files = walkSync(realPath);

  files.forEach(function(file) {
    var relativePath = file.replace(realPath + '/', '');
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
      dirname.split('/').forEach(function(component) {
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
      e.message = 'Problem loading ' + file + '\n\n' + e.message;
      throw e;
    }
  });

  return root;
}


module.exports.load = function(pathToRoot) {
  var root = buildModuleTree(pathToRoot);
  var skit = buildModuleTree(path.resolve(__dirname, '..', 'skit'), 'skit');
  root.addChildNode(skit);
  return root;
};
