/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var http = require('http');

var async = require('async');

var loader = require('./loader/loader');
var SkitModule = require('./loader/SkitModule');


var loadCache_ = null;
var loadingCallbacks_ = null;

function load(packagePath, _callback, opt_cache) {
  if (loadingCallbacks_) {
    loadingCallbacks_.push(_callback);
    return;
  }

  if (loadCache_) {
    _callback.apply(null, loadCache_);
    return;
  }

  loadingCallbacks_ = [_callback];
  var callback = function() {
    var args = Array.prototype.slice.apply(arguments);
    if (opt_cache) {
      loadCache_ = args;
    }

    var callbacks = loadingCallbacks_;
    loadingCallbacks_ = null;

    callbacks.forEach(function(cb) {
      cb.apply(null, args);
    });
  };

  var treeRoot = loader.load(packagePath);
  var publicRoot = treeRoot.getChildWithName('public');
  if (!publicRoot) {
    throw new Exception('Improperly configured: No directory "public" in skit root.');
  }

  SkitModule.beginRecordingLoadedFiles();
  var getMain = function(module, cb) {
    if (!module.getMainObject) {
      cb(null, null);
      return;
    }
    module.getMainObject(function(err, object) {
      cb(err, object);
    });
  };
  async.map(publicRoot.descendants(), getMain, function(err, results) {
    var publicLoadedFiles = SkitModule.getLoadedFiles();
    callback(err, publicRoot, publicLoadedFiles);
  });
}


function run(packagePath, opt_options) {
  var options = opt_options || {};
  var port = options.port || 3001;

  if (!options.debug) {
    // Start loading modules ASAP if we're in debug.
    load(packagePath, function() {}, true);
  }

  var server = http.createServer(function(req, res) {
    var start = new Date();

    load(packagePath, function(err, publicRoot, publicLoadedFiles) {
      if (err) {
        res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'});
        res.end('Skit fatal error: Could not load tree:\n\n' + err);
        return;
      }

      var parts = req.url.split('?');
      var path = parts[0];
      var query = parts[1];

      var module = publicRoot.findNodeWithPath(path, '/');
      var controllerModule;
      if (module) {
        controllerModule = module.children()[0];
      }

      if (!controllerModule) {
        res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
        res.end('Could not find any module at this path.');
        return;
      }

      controllerModule.getMainObject(function(err, ControllerKlass, ControllerKlassPath) {
        var controller = null;
        if (typeof ControllerKlass == 'function') {
          controller = new ControllerKlass(req);
        }
        if (!controller || !controller.__render__) {
          res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
          res.end('Could not find any controller at this path.');
          return;
        }

        console.log('Got to preload in:', +(new Date()) - start, 'ms');

        controller.__preload__(function(var_args) {
          var args = Array.prototype.slice.call(arguments);

          controller.__load__.apply(controller, args);
          var title = controller.__title__();
          var html = controller.__render__();

          res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
          res.write('<!DOCTYPE HTML><html><head><title>');
          res.write(title);
          res.write('</title></head><body>');
          res.write(html);
          res.write(
            '<script>(function() {' +
            '  window.skit = {' +
            '    files: {}' +
            '  };' +
            ' })()</script>');

          publicLoadedFiles.forEach(function(file) {
            var localDeps = Object.keys(file.dependencies);
            var functionString = file.transformer.functionStringWithDependencies(localDeps);
            var depsInWindow = localDeps.map(function(dep) {
              var globalDep = file.dependencies[dep];
              return 'window.skit.files[' + JSON.stringify(globalDep) + ']';
            });
            res.write(
              '<script>(function() {\n\n' +
              '  window.skit.files[' + JSON.stringify(file.path) + '] = ' +
                    functionString + '(' + depsInWindow.join(',') + ');\n\n' +
              '})()</script>\n\n');
          });

          res.write(
            ['<script>(function() {',
              'var ControllerKlass = window.skit.files[' + JSON.stringify(ControllerKlassPath) + '];',
              'var controller = new ControllerKlass(/* request object */);',
              'controller.__load__.apply(controller, ' + JSON.stringify(args) + ');',
              'controller.__ready__();',
            '})()</script>'].join('\n'));

          res.end('</body></html>');
        });
      });
    });
  });
  server.listen(port);

  console.log('Skit started on localhost:' + port);
}


module.exports = {
  'run': run
};
