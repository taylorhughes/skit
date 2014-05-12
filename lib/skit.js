/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var http = require('http');
var fs = require('fs');

var bodyParser = require('body-parser');
var connect = require('connect');
var compression = require('compression');
var Cookies = require('cookies');
var Handlebars = require('handlebars');

var SkitModule = require('./loader/SkitModule');
var loader = require('./loader/loader');
var scriptresource = require('./loader/scriptresource');
var TargetEnvironment = scriptresource.TargetEnvironment;


var DEBUG = false;
var PACKAGE_PATH = null;
var PUBLIC_ROOT = null;

var BOOTSTRAP_TEMPLATE = null;
var RESOURCES_BY_MODULE_PATH = null;
var EVALUATED_OBJECTS_BY_MODULE_PATH = null;

var STATIC_PREFIX = '/__static__/';
var PROXY_PREFIX = '/__proxy__/';

var GLOBAL_DEPENDENCIES = [];
var PROXIES = {};
var PROXY_MODULE = 'skit.platform.netproxy:js';

function safeStringify(arg) {
  return JSON.stringify(arg).replace(/[<>]/g, function(char) { return '\\x' + char.charCodeAt(0).toString(16) });
}
Handlebars.registerHelper('json', function(arg) {
  return new Handlebars.SafeString(safeStringify(arg));
});


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

  RESOURCES_BY_MODULE_PATH = {};
  EVALUATED_OBJECTS_BY_MODULE_PATH = {};

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

  var allResources = controllerModule.buildResourceList();
  var cssResources = [];
  var scriptResources = [];

  for (var i = 0; i < allResources.length; i++) {
    var resource = allResources[i];
    RESOURCES_BY_MODULE_PATH[resource.modulePath] = resource;

    if (resource.getCssString) {
      cssResources.push(resource);
      continue;
    }
    scriptResources.push(resource);

    var evaluatedDependencies = resource.getAbsoluteDependencyPaths().map(function(dependencyPath) {
      return EVALUATED_OBJECTS_BY_MODULE_PATH[dependencyPath];
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
    EVALUATED_OBJECTS_BY_MODULE_PATH[resource.modulePath] = object;
  };

  var netproxy = EVALUATED_OBJECTS_BY_MODULE_PATH[PROXY_MODULE];
  if (netproxy) {
    Object.keys(PROXIES).forEach(function(name) {
      var proxy = PROXIES[name];
      var apiRequest;

      var reqWrap = {
        cookies: req.cookies
      };
      var resWrap = {
        cookies: res.cookies
      };

      netproxy.__register__(name, {
        modifyRequest: function(apiRequest_) {
          apiRequest = apiRequest_;
          proxy.modifyRequest(reqWrap, apiRequest);
        },
        modifyResponse: function(apiResponse) {
          proxy.modifyResponse(apiRequest, apiResponse, resWrap);
        }
      });
    });
  } else {
    // netproxy module was not loaded -- this page must not use it.
  }

  var controllerModulePath = scriptResources[scriptResources.length - 1].modulePath;
  var ControllerKlass = EVALUATED_OBJECTS_BY_MODULE_PATH[controllerModulePath];
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
    var controllerArgs = Array.prototype.slice.call(arguments);

    controller.__load__.apply(controller, controllerArgs);
    try {
      var title = controller.__title__();
      var html = controller.__render__();
    } catch (e) {
      var wrapped = new Error('Error rendering content: ' + e);
      wrapped.stack = e.stack;
      throw wrapped;
    }

    var cssUrls = cssResources.map(function(resource) {
      return '/__static__/' + escape(resource.modulePath);
    });
    var scriptUrls = scriptResources.map(function(resource) {
      if (!resource.includeInEnvironment(TargetEnvironment.BROWSER)) {
        // continue
        return null;
      }
      return '/__static__/' + escape(resource.modulePath);
    }).filter(function(url) { return !!url; })

    var clientProxyObjects = [];
    if (netproxy) {
      clientProxyObjects = Object.keys(PROXIES).map(function(name) {
        var proxy = PROXIES[name];
        return {
          name: name,
          csrfToken: proxy.generateCSRF()
        };
      });
    }

    var html = BOOTSTRAP_TEMPLATE({
      title: title,
      html: html,

      cssUrls: cssUrls,
      scriptUrls: scriptUrls,

      netproxyModulePath: PROXY_MODULE,
      clientProxyObjects: clientProxyObjects,

      controllerModulePath: controllerModulePath,
      controllerArgs: controllerArgs
    });

    // TODO(taylor): Render CSS ASAP.
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(html);
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


function ProxyHandler(name, modifyRequest, modifyResponse) {
  this.name = name;
  this.modifyRequest = modifyRequest;
  this.modifyResponse = modifyResponse;
}

ProxyHandler.prototype.verifyCSRF = function(token) {
  // TODO(taylor): Verify CSRF token is valid by checking against
  // aforementioned crypto secret.
  return token.indexOf(this.name) > 0;
};

ProxyHandler.prototype.generateCSRF = function() {
  // TODO(taylor): Create CSRF crypto secret based on name, then
  // generate a time-sensitive token here.
  return 'token:' + this.name;
};


function registerProxy(name, modifyRequest, modifyResponse) {
  if (GLOBAL_DEPENDENCIES.indexOf('skit.platform.netproxy') < 0) {
    GLOBAL_DEPENDENCIES.push('skit.platform.netproxy');
  }
  PROXIES[name] = new ProxyHandler(name, modifyRequest, modifyResponse);
}


function serveProxy(req, res) {
  if (req.method != 'POST') {
    res.writeHead(405, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Method not allowed.');
    return;
  }

  var name = req.url.replace(PROXY_PREFIX, '');
  var proxy = PROXIES[name];
  if (!proxy) {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Could not find any proxy at this path.');
    return;
  }

  var csrfToken = req.body['csrfToken'];
  if (!proxy.verifyCSRF(csrfToken)) {
    res.writeHead(403, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Invalid CSRF token.');
    return;
  }

  var method = req.body['method'];
  var headers = req.body['headers'] || {};
  var url = req.body['url'];
  var body = req.body['body'];

  var apiRequest = {
    url: url,
    body: body,
    headers: headers,
    method: method
  };

  var reqWrap = {
    cookies: req.cookies
  };
  var resWrap = {
    cookies: res.cookies
  };

  proxy.modifyRequest(reqWrap, apiRequest);

  var net = EVALUATED_OBJECTS_BY_MODULE_PATH['skit.platform.net:js'];
  net.send(apiRequest.url, {
    method: apiRequest.method,
    headers: apiRequest.headers,
    body: apiRequest.body,
    complete: function(apiResponse) {
      proxy.modifyResponse(apiRequest, apiResponse, resWrap);

      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify({
        'status': apiResponse.status,
        'headers': apiResponse.headers,
        'body': apiResponse.body
      }));
    }
  });
}


function run(packagePath, opt_options) {
  if (PACKAGE_PATH) {
    throw new Error('Cannot run multiple skits (yet). Sorry about that.');
  }

  var options = opt_options || {};
  var port = options.port || 3001;

  PACKAGE_PATH = packagePath;
  if (options.debug) {
    DEBUG = true;
  }

  var templateSource = fs.readFileSync(__dirname + '/bootstrap.html').toString();
  BOOTSTRAP_TEMPLATE = Handlebars.compile(templateSource);

  if (Array.isArray(options.dependencies)) {
    GLOBAL_DEPENDENCIES = GLOBAL_DEPENDENCIES.concat(options.dependencies);
  }

  var app = connect();
  app.use(compression());
  app.use(Cookies.express());
  app.use(bodyParser());
  app.use(function(req, res) {
    try {
      if (req.url.indexOf(STATIC_PREFIX) == 0) {
        serveStatic(req, res);
      } else if (req.url.indexOf(PROXY_PREFIX) == 0) {
        serveProxy(req, res);
      } else {
        load();
        serveController(req, res);
      }
    } catch (e) {
      renderError(res, e);
    }
  });

  var server = http.createServer(app);
  server.listen(port);

  console.log('Skit started on localhost:' + port);
}


module.exports = {
  'run': run,
  'registerProxy': registerProxy,
};
