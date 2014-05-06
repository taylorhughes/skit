/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var http = require('http');

var SkitModule = require('./loader/SkitModule');
var loader = require('./loader/loader');
var scriptresource = require('./loader/scriptresource');
var TargetEnvironment = scriptresource.TargetEnvironment;


function run(packagePath, opt_options) {
  var options = opt_options || {};
  var port = options.port || 3001;


  var start = new Date();
  var tree = loader.load(packagePath);
  console.log('Loaded complete tree in: ' + (+(new Date()) - start) + 'ms');

  var server = http.createServer(function(req, res) {

    try {
      if (options.debug) {
        tree = loader.load(packagePath);
      }
    } catch (e) {
      res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('Skit load error: Could not load tree:\n\n' + e + '\n\n' + e.stack);
      return;
    }

    var publicRoot = tree.findNodeWithPath('public');
    if (!publicRoot) {
      res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('Skit fatal error: Could not find public root.');
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

    try {
      var resources = controllerModule.buildResourceList();
    } catch(e) {
      res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('Skit fatal error: Could not build resources list: ' + e + '\n\n' + e.stack);
      return;
    }

    var evaluatedResourcesByModulePath = {};
    for (var i = 0; i < resources.length; i++) {
      var resource = resources[i];
      var evaluatedDependencies = resource.getAbsoluteDependencyPaths().map(function(dependencyPath) {
        return evaluatedResourcesByModulePath[dependencyPath];
      });

      if (!resource.includeInEnvironment(TargetEnvironment.SERVER)) {
        continue;
      }

      try {
        var object = eval(resource.getFunctionString()).apply({}, evaluatedDependencies);
      } catch(e) {
        res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'});
        res.end('Could not load module: ' + resource.modulePath + ' with error: ' + e);
        return;
      }

      console.log('loaded: ', resource.modulePath);
      evaluatedResourcesByModulePath[resource.modulePath] = object;
    };


    var controllerModulePath = resources[resources.length - 1].modulePath;
    var ControllerKlass = evaluatedResourcesByModulePath[controllerModulePath];

    var controller = new ControllerKlass();
    controller.__preload__(function(var_args) {
      var args = Array.prototype.slice.call(arguments);

      controller.__load__.apply(controller, args);
      try {
        var title = controller.__title__();
        var html = controller.__render__();
      } catch (e) {
        // TODO(Taylor): Properly render error page.
        res.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'});
        res.end('Error rendering content: ' + e);
        return;
      }

      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.write('<!DOCTYPE HTML><html><head><title>');
      res.write(title);
      res.write('</title></head><body>');
      res.write(html);
      res.write(
        '<script>(function() {' +
        '  window.skit = {' +
        '    evaluatedResources: {}' +
        '  };' +
        ' })()</script>');

      resources.forEach(function(resource) {
        if (!resource.includeInEnvironment(TargetEnvironment.BROWSER)) {
          // continue
          return;
        }

        var depsInWindow = resource.getAbsoluteDependencyPaths().map(function(globalDep) {
          return 'window.skit.evaluatedResources[' + JSON.stringify(globalDep) + ']';
        });
        res.write(
          '<script>(function() {\n\n' +
          '  window.skit.evaluatedResources[' + JSON.stringify(resource.modulePath) + '] = ' +
                resource.getFunctionString() + '(' + depsInWindow.join(',') + ');\n\n' +
          '})()</script>\n\n');
      });

      res.write(
        ['<script>(function() {',
          'var ControllerKlass = window.skit.evaluatedResources[' + JSON.stringify(controllerModulePath) + '];',
          'var controller = new ControllerKlass(/* request object */);',
          'controller.__load__.apply(controller, ' + JSON.stringify(args) + ');',
          'controller.__ready__();',
        '})()</script>'].join('\n'));

      res.end('</body></html>');
    });
  });
  server.listen(port);

  console.log('Skit started on localhost:' + port);
}


module.exports = {
  'run': run
};
