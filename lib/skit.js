/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var http = require('http');
var fs = require('fs');
var querystring = require('querystring');

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
var PACKAGE_ROOT = null;

var PUBLIC_ROUTES = null;
var URL_ARGUMENTS = [];

var BOOTSTRAP_TEMPLATE = null;

var STATIC_PREFIX = '/__static__/';
var PROXY_PREFIX = '/__proxy__/';

var PROXIES = {};
var PROXY_MODULE = 'skit.platform.netproxy';
var PROXY_RESOURCE = PROXY_MODULE + ':js';


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


function loadRoot(opt_force) {
  if (PACKAGE_ROOT && !opt_force) {
    return PACKAGE_ROOT;
  }

  PACKAGE_ROOT = loader.load(PACKAGE_PATH);
  PUBLIC_ROUTES = [];

  var publicRoot = PACKAGE_ROOT.findNodeWithPath('public');
  if (!publicRoot) {
    throw new Error('Could not find public root.');
  }

  var util = loadObjectFromModulePath('skit.platform.util');

  var children = publicRoot.children();
  var handled = {};
  while (children.length) {
    var module = children.shift();
    if (module.buildResourceList) {
      var resources = loadResourcesForModule(module);
      var object = resources.object || {};
      if (object.__controller__) {
        var modulePath = module.modulePath.split('.');
        // Trim off the first piece ("public") and the last bit ("SomeController").
        modulePath = modulePath.slice(1, -1);
        var urlPath = modulePath.join('/');
        var modulePathRegex = util.escapeRegex(urlPath);
        var argumentGroups = [];
        URL_ARGUMENTS.forEach(function(obj) {
          argumentGroups.push(obj.name);
          modulePathRegex = modulePathRegex.replace(obj.namePattern, '(' + obj.argumentPatternString + ')');
        });
        if (modulePathRegex) {
          modulePathRegex += '/?';
        }
        var route = new RegExp('^/' + modulePathRegex + '$');
        PUBLIC_ROUTES.push({
          route: route,
          modulePath: module.modulePath,
          argumentGroups: argumentGroups,
        });
      }
    }
    
    children = children.concat(module.children());
  }

  console.log('Built routes:');
  PUBLIC_ROUTES.forEach(function(route) {
    console.log('  ', route.route, ' -> ', route.modulePath);
  });

  return PACKAGE_ROOT;
}


function loadResourcesForModule(module) {
  var allResources = module.buildResourceList();
  var cssResources = [];
  var scriptResources = [];
  var evaluatedObjects = {};
  var lastObject;

  for (var i = 0; i < allResources.length; i++) {
    var resource = allResources[i];

    if (resource.getCssString) {
      cssResources.push(resource);
      continue;
    }
    scriptResources.push(resource);

    var evaluatedDependencies = resource.getAbsoluteDependencyPaths().map(function(dependencyPath) {
      return evaluatedObjects[dependencyPath];
    });

    if (!resource.includeInEnvironment(TargetEnvironment.SERVER)) {
      continue;
    }

    if (!resource.__object__) {
      console.log('Evaluating: ', resource.modulePath);
      try {
        resource.__object__ = eval(resource.getFunctionString()).apply({}, evaluatedDependencies);
      } catch(e) {
        var wrapped = new Error('Could not load module: ' + resource.modulePath + ' with error: ' + e);
        wrapped.stack = e.stack;
        throw wrapped;
      }
    }

    evaluatedObjects[resource.modulePath] = resource.__object__;
    lastObject = resource.__object__;
  };

  return {
    cssResources: cssResources,
    scriptResources: scriptResources,
    object: lastObject
  };
}


function loadObjectFromModulePath(modulePath) {
  var root = loadRoot();
  var module = root.findNodeWithPath(modulePath);
  var resources = loadResourcesForModule(module);
  return resources.object;
}


function serveController(req, res) {
  var root = loadRoot(DEBUG);

  var parts = req.url.split('?');
  var path = parts[0];
  var query = parts[1];

  var controllerModule;
  var urlArguments = {};
  for (var i = 0, length = PUBLIC_ROUTES.length; i < length; i++) {
    var route = PUBLIC_ROUTES[i];
    var result = route.route.exec(path);
    if (result) {
      for (var i = 1; i < result.length; i++) {
        var argumentName = route.argumentGroups[i - 1];
        urlArguments[argumentName] = result[i];
      }
      controllerModule = root.findNodeWithPath(route.modulePath);
      break;
    }
  }

  if (!controllerModule) {
    console.log('GET ' + req.url + ' - 404');
    res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
    res.end('Could not find any Controller at this path. Are you using Controller.create({}) to define your controller?');
    return;
  }

  console.log('Handling ' + req.url + ' ...');

  var netproxy = loadObjectFromModulePath(PROXY_MODULE);

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

  var controllerResources = loadResourcesForModule(controllerModule);
  var scripts = controllerResources.scriptResources;
  var controllerModuleResourcePath = scripts[scripts.length - 1].modulePath;
  var stylesheets = controllerResources.cssResources;

  var requestWrap = {
    params: urlArguments
  };

  var ControllerKlass = controllerResources.object;
  var controller = new ControllerKlass(requestWrap);

  var navigation = loadObjectFromModulePath('skit.platform.navigation');
  navigation.__reset__();

  controller.__preload__(function(var_args) {
    if (navigation.__notfound__()) {
      // TODO(taylor): Custom 404, etc.
      console.log('GET ' + req.url + ' - 404');
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('Resource not found at this path.');
      return;
    }

    var redirectUrl = navigation.__redirect__();
    if (redirectUrl) {
      // TODO(taylor): Support 301 permanent redirect.
      console.log('GET ' + req.url + ' - 302 -> ' + redirectUrl);
      res.writeHead(302, {'Location': redirectUrl});
      res.end('');
      return;
    }

    var controllerArgs = Array.prototype.slice.call(arguments);

    controller.__load__.apply(controller, controllerArgs);
    try {
      var title = controller.__title__();
      var meta = controller.__meta__();
      var body = controller.__body__();
    } catch (e) {
      var wrapped = new Error('Error rendering content: ' + e);
      wrapped.stack = e.stack;
      throw wrapped;
    }

    var cssUrls = stylesheets.map(function(resource) {
      return '/__static__/' + escape(resource.modulePath);
    });
    var scriptUrls = scripts.map(function(resource) {
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
      meta: meta,
      body: body,

      cssUrls: cssUrls,
      scriptUrls: scriptUrls,

      netproxyModulePath: PROXY_RESOURCE,
      clientProxyObjects: clientProxyObjects,

      requestWrap: requestWrap,
      controllerModulePath: controllerModuleResourcePath,
      controllerArgs: controllerArgs
    });

    // TODO(taylor): Render CSS before the preload is done.
    console.log('GET ' + req.url + ' - 200');
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(html);
  });
}


function serveStatic(req, res) {
  var root = loadRoot();

  var modulePath = unescape(req.url.replace(STATIC_PREFIX, ''));
  var parts = modulePath.split(':');
  var resource;
  if (parts.length == 2) {
    var module = root.findNodeWithPath(parts[0]);
    if (module) {
      resource = module.getResourceNamed(parts[1]);
    }
  }

  if (!resource) {
    console.log('Not found:', modulePath, parts);
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
  var headers = querystring.parse(req.body['headers'] || '');
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

  var net = loadObjectFromModulePath('skit.platform.net');
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


function registerUrlArgument(name, pattern) {
  var match = /^\/([^\/]+)\/[a-z]*$/.exec('' + pattern);
  if (typeof name !== 'string' || !match) {
    throw new Error("Please provide a name (string, eg. '__id__') and a " +
        " pattern (RegExp, eg. /\\d{1,12}/ -- modifiers like ^, $, /mg " +
        " will be ignored.).");
  }
  URL_ARGUMENTS.push({
    name: name,
    namePattern: new RegExp(name, 'g'),
    argumentPatternString: match[1],
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

  // Prime the caches!
  loadRoot();

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
  'registerUrlArgument': registerUrlArgument,
};
