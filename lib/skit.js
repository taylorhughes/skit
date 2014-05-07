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


var DEBUG = false;
var PACKAGE_PATH = null;
var PUBLIC_ROOT = null;
var RESOURCES_BY_MODULE_PATH = {};
var STATIC_PREFIX = '/__static__/';


function renderError(res, e) {
  res.writeHead(502, {'Content-Type': 'text/html; charset=utf-8'});
  res.write('<h1>Error processing request</h1>');
  res.write('<h2 style="font-family: consolas, fixed-width">' + e + '</h2>');
  if (e.stack) {
    res.write('<div style="padding: 20px; margin-top: 20px; background: #eee;"><pre>' + e.stack + '</pre></div>');
  }
  res.end();
}

function load() {
  if (!DEBUG && PUBLIC_ROOT) {
    return;
  }

  var tree = loader.load(PACKAGE_PATH);
  PUBLIC_ROOT = tree.findNodeWithPath('public');

  if (!PUBLIC_ROOT) {
    throw new Error('Could not find public root.');
  }
}


function serveController(req, res) {
  var parts = req.url.split('?');
  var path = parts[0];
  var query = parts[1];

  var module = PUBLIC_ROOT.findNodeWithPath(path, '/');
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
    var allResources = controllerModule.buildResourceList();
  } catch(e) {
    var wrapped = new Error('Could not load dependencies: ' + e);
    wrapped.stack = e.stack;
    throw wrapped;
  }

  var cssResources = [];
  var scriptResources = [];

  var evaluatedResourcesByModulePath = {};
  for (var i = 0; i < allResources.length; i++) {
    var resource = allResources[i];
    RESOURCES_BY_MODULE_PATH[resource.modulePath] = resource;

    if (resource.getCssString) {
      cssResources.push(resource);
      continue;
    }
    scriptResources.push(resource);

    var evaluatedDependencies = resource.getAbsoluteDependencyPaths().map(function(dependencyPath) {
      return evaluatedResourcesByModulePath[dependencyPath];
    });

    if (!resource.includeInEnvironment(TargetEnvironment.SERVER)) {
      continue;
    }

    try {
      var object = eval(resource.getFunctionString()).apply({}, evaluatedDependencies);
    } catch(e) {
      var wrapped = new Error('Could not load module: ' + resource.modulePath + ' with error: ' + e);
      wrapped.stack = e.stack;
      throw wrapped;
    }

    console.log('Evaluated: ', resource.modulePath);
    evaluatedResourcesByModulePath[resource.modulePath] = object;
  };


  var controllerModulePath = scriptResources[scriptResources.length - 1].modulePath;
  var ControllerKlass = evaluatedResourcesByModulePath[controllerModulePath];
  var controller = {};
  if (typeof ControllerKlass == 'function') {
    controller = new ControllerKlass();
  }

  if (!controller.__render__) {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Could not find Controller at this path.');
    return;
  }

  controller.__preload__(function(var_args) {
    var args = Array.prototype.slice.call(arguments);

    controller.__load__.apply(controller, args);
    try {
      var title = controller.__title__();
      var html = controller.__render__();
    } catch (e) {
      var wrapped = new Error('Error rendering content: ' + e);
      wrapped.stack = e.stack;
      throw wrapped;
    }

    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.write('<!DOCTYPE HTML><html><head><title>');
    res.write(title);
    res.write('</title>');
    cssResources.forEach(function(resource) {
      res.write('\n<link rel="stylesheet" href="/__static__/' + escape(resource.modulePath) + '">');
    });
    res.write('</head><body>');
    res.write(html);
    res.write(
      '<script>(function() {' +
      '  window.skit = {' +
      '    objects: {}' +
      '  };' +
      ' })()</script>');

    scriptResources.forEach(function(resource) {
      if (!resource.includeInEnvironment(TargetEnvironment.BROWSER)) {
        // continue
        return;
      }

      res.write(
        '\n<script src="/__static__/' + escape(resource.modulePath) + '"></script>');
    });

    res.write(
      ['<script>(function() {',
        '  var ControllerKlass = skit.objects[' + JSON.stringify(controllerModulePath) + '];',
        '  var controller = new ControllerKlass(/* request object */);',
        '  controller.__load__.apply(controller, ' + JSON.stringify(args) + ');',
        '  controller.__ready__();',
        '})()',
        '</script>'].join('\n'));

    res.end('</body></html>');
  });
}


function serveStatic(req, res) {
  var modulePath = unescape(req.url.replace(STATIC_PREFIX, ''));
  var resource = RESOURCES_BY_MODULE_PATH[modulePath];
  if (!resource) {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Could not find any resource at this path.');
    return;
  }

  var headers = {
    'Cache-Control': 'no-cache'
  };

  if (resource.getFunctionString) {
    headers['Content-Type'] = 'application/javascript';
    res.writeHead(200, headers);
    var depsInWindow = resource.getAbsoluteDependencyPaths().map(function(globalDep) {
      return 'skit.objects[' + JSON.stringify(globalDep) + ']';
    });
    res.end('skit.objects[' + JSON.stringify(resource.modulePath) + '] = ' +
        '(' + resource.getFunctionString() + ')(' + depsInWindow.join(',') + ')');
  } else {
    headers['Content-Type'] = 'text/css';
    res.writeHead(200, headers);
    res.end(resource.getCssString());
  }
}


function run(packagePath, opt_options) {
  var options = opt_options || {};
  var port = options.port || 3001;

  PACKAGE_PATH = packagePath;
  if (options.debug) {
    DEBUG = true;
  }

  var server = http.createServer(function(req, res) {
    try {
      if (req.url.indexOf(STATIC_PREFIX) == 0) {
        serveStatic(req, res);
      } else {
        if (DEBUG) {
          load();
        }

        serveController(req, res);
      }
    } catch (e) {
      renderError(res, e);
    }
  });
  server.listen(port);

  console.log('Skit started on localhost:' + port);
}


module.exports = {
  'run': run
};
