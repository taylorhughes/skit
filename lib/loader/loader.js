
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


function buildModuleTree(rootPath) {
  var rootName = path.basename(rootPath);
  var root = new NamedNode(rootName);

  var realPath = fs.realpathSync(rootPath);
  var files = walkSync(realPath);

  files.forEach(function(file) {
    var relativePath = file.replace(realPath + '/', '');

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

    // Foo.js, Foo_bar.js, Foo.bar.js, Foo_bar.bz.js -> all belong to the "Foo" module.
    var moduleName = basename.split('.').slice(0, 1)[0];
    moduleName = moduleName.split('_').slice(0, 1)[0];

    var moduleNode = parent.getChildWithName(moduleName);
    if (!moduleNode) {
      moduleNode = new SkitModule(moduleName);
      parent.addChildNode(moduleNode);
    }
    moduleNode.addFile(file);
  });

  return root;
}


module.exports.load = function(pathToRoot) {
  var root = buildModuleTree(pathToRoot);
  var skit = buildModuleTree(path.resolve(__dirname, '..', 'skit'));
  root.addChildNode(skit);

  return root;
}
