/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var crypto = require('crypto');
var http = require('http');
var fs = require('fs');
var path = require('path');
var querystring = require('querystring');

var bodyParser = require('body-parser');
var connect = require('connect');
var compression = require('compression');
var Cookies = require('cookies');
var Handlebars = require('handlebars');
var send = require('send');

var SkitModule = require('./loader/SkitModule');
var loader = require('./loader/loader');
var scriptresource = require('./loader/scriptresource');
var TargetEnvironment = scriptresource.TargetEnvironment;


var RESOURCE_PREFIX = '/__resource__/';
var PROXY_PREFIX = '/__proxy__/';
var STATIC_PREFIX = '/__static__/';
var STATIC_PATH = null;
var ALIAS_MAP_FILENAME = '__alias-map__.json';

var PROXY_MODULE = 'skit.platform.netproxy';
var PROXY_RESOURCE = PROXY_MODULE + ':js';
var NAVIGATION_MODULE = 'skit.platform.navigation';

var RESOURCE_ALIAS_MAP = {};


var BOOTSTRAP_TEMPLATE = (function() {
  var templateSource = fs.readFileSync(__dirname + '/bootstrap.html').toString();
  return Handlebars.compile(templateSource);  
})();

var ERROR_TEMPLATE = (function() {
  var templateSource = fs.readFileSync(__dirname + '/error.html').toString();
  return Handlebars.compile(templateSource);  
})();


function safeStringify(arg) {
  return JSON.stringify(arg).replace(/[<>]/g, function(char) { return '\\x' + char.charCodeAt(0).toString(16) });
}
Handlebars.registerHelper('json', function(arg) {
  return new Handlebars.SafeString(safeStringify(arg));
});


function escapeHtml(str) {
  return str && str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


function escapeRegex(str) {
  if (!str) { return str; }
  return str.replace(/[\[\]\/\\{}()*+?.^$|-]/g, '\\$&');
}


function renderError(res, opt_e, opt_message, opt_code) {
  var message = opt_message || 'Error processing request';

  var excerptHtml;
  if (opt_e && opt_e.fileName && typeof opt_e.lineNumber == 'number') {
    var fileContent = '<unknown file>';
    try {
      fileContent = fs.readFileSync(opt_e.fileName).toString();
    } catch (e) {
      console.log('Could not read file: ', e);
    }

    var lines = fileContent.split(/\n/).map(function(line, i) {
      line = '<b>' + ('   ' + (i + 1)).slice(-4) + '</b>' + escapeHtml(line);
      if (i == opt_e.lineNumber - 1) {
        line = '<span class="current">' + line + '</span>';
      }
      return line;
    });
    var relevantLines = lines.slice(Math.max(0, opt_e.lineNumber - 5), opt_e.lineNumber + 5);
    excerptHtml = relevantLines.join('\n');
  }

  var html = ERROR_TEMPLATE({
    message: message,
    code: opt_code,
    error: opt_e,
    excerptHtml: excerptHtml
  });

  res.writeHead(opt_code || 502, {'Content-Type': 'text/html; charset=utf-8'});
  res.write(html);
  res.end();
}


// Not really constants.
var DEBUG = false;
var PACKAGE_PATH = null;
var PACKAGE_ROOT = null;

var PUBLIC_ROUTES = null;
var URL_ARGUMENTS = [];

var PROXIES = {};


function loadRoot(opt_force) {
  if (PACKAGE_ROOT && !opt_force) {
    return;
  }

  PACKAGE_ROOT = loader.load(PACKAGE_PATH);
  PUBLIC_ROUTES = [];

  var publicRoot = PACKAGE_ROOT.findNodeWithPath('public');
  if (!publicRoot) {
    throw new Error('Could not find public root.');
  }

  var children = publicRoot.children();
  var handled = {};
  while (children.length) {
    var module = children.shift();
    if (module.buildResourceList) {
      var resources = loadResourcesForModule(module);

      var object = resources.objectsByModulePath[module.modulePath];
      if (object && object.__controller__) {
        var modulePath = module.modulePath.split('.');
        // Trim off the first piece ("public") and the last bit ("SomeController").
        modulePath = modulePath.slice(1, -1);
        var urlPath = modulePath.join('/');
        var modulePathRegex = escapeRegex(urlPath);
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
}


function loadResourcesForModule(module) {
  var allResources = module.buildResourceList();
  var cssResources = [];
  var scriptResources = [];
  var evaluatedObjects = {};

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

    var functionString = resource.getFunctionString();
    var evaluatedFunction;
    var object;

    try {
      evaluatedFunction = eval(functionString);
    } catch (e) {
      var wrapped = new Error('Parse error ' + resource.filePath);
      wrapped.stack = e.stack;
      throw wrapped;
    }

    try {
      object = evaluatedFunction.apply({}, evaluatedDependencies);
    } catch(e) {
      var wrapped = e.constructor(e.message);
      var lineNumberAndCharacter = e.stack.split(/\n/)[1].match(/:(\d+):(\d+)\)$/);
      var lineNumber = +(lineNumberAndCharacter[1]);
      var charNumber = +(lineNumberAndCharacter[2]);
      wrapped.fileName = resource.filePath;
      wrapped.lineNumber = lineNumber - resource.getFunctionStringTracebackOffset();
      wrapped.charNumber = charNumber;
      wrapped.stack = e.stack;
      throw wrapped;
    }

    evaluatedObjects[resource.modulePath] = object;
    var rootModulePath = resource.modulePath.split(':')[0];
    evaluatedObjects[rootModulePath] = object;
  };

  return {
    cssResources: cssResources,
    scriptResources: scriptResources,
    objectsByModulePath: evaluatedObjects,
  };
}


function loadObjectFromModulePath(modulePath) {
  var module = PACKAGE_ROOT.findNodeWithPath(modulePath);
  var resources = loadResourcesForModule(module);
  return resources.objectsByModulePath[modulePath];
}


function renderControllerForRequest(req, originalUrl, res, shouldNavigate, shouldError, shouldFinish) {
  console.log('Handling request: ', req.url);

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
      controllerModule = PACKAGE_ROOT.findNodeWithPath(route.modulePath);
      break;
    }
  }

  if (!controllerModule) {
    shouldError(404, 'Could not find any Controller at this path. Are you using Controller.create({}) to define your controller?');
    return;
  }

  var controllerResources = loadResourcesForModule(controllerModule);

  var ControllerKlass = controllerResources.objectsByModulePath[controllerModule.modulePath];
  var requestWrap = {
    params: urlArguments,
    url: req.url
  };
  var controller = new ControllerKlass(requestWrap);

  var netproxy = controllerResources.objectsByModulePath[PROXY_MODULE];
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
  }

  var renderFinal = function(allControllerArgs) {
    var title = '';
    var meta = '';
    var body = '';

    try {
      var currentKlass = ControllerKlass;
      while (currentKlass) {
        if (currentKlass.prototype.hasOwnProperty('__title__')) {
          title = currentKlass.prototype.__title__.call(controller, title);
        }
        if (currentKlass.prototype.hasOwnProperty('__meta__')) {
          meta = currentKlass.prototype.__meta__.call(controller, meta);
        }
        if (currentKlass.prototype.hasOwnProperty('__body__')) {
          body = currentKlass.prototype.__body__.call(controller, body);
        }
        currentKlass = currentKlass.__parent__;
      }
    } catch (e) {
      shouldError(500, 'Error rendering content: ' + e, e);
      return;
    }

    var cssUrls = controllerResources.cssResources.map(function(resource) {
      if (resource.modulePath in RESOURCE_ALIAS_MAP) {
        return RESOURCE_ALIAS_MAP[resource.modulePath];
      }
      return RESOURCE_PREFIX + escape(resource.modulePath);
    });

    var added = {};
    cssUrls = cssUrls.filter(function(cssUrl) {
      if (cssUrl in added) {
        return false;
      }
      added[cssUrl] = true;
      return true;
    });

    var scripts = controllerResources.scriptResources;
    var scriptUrls = scripts.map(function(resource) {
      if (!resource.includeInEnvironment(TargetEnvironment.BROWSER)) {
        // continue
        return null;
      }
      if (resource.modulePath in RESOURCE_ALIAS_MAP) {
        return RESOURCE_ALIAS_MAP[resource.modulePath];
      }
      return RESOURCE_PREFIX + escape(resource.modulePath);
    });

    scriptUrls = scriptUrls.filter(function(scriptUrl) {
      if (!scriptUrl) {
        return false;
      }
      if (scriptUrl in added) {
        return false;
      }
      added[scriptUrl] = true;
      return true;
    });

    var clientProxyObjects = Object.keys(PROXIES).map(function(name) {
      var proxy = PROXIES[name];
      return {
        name: name,
        csrfToken: proxy.generateCSRF()
      };
    });

    var controllerModuleResourcePath = scripts[scripts.length - 1].modulePath;
    var html = BOOTSTRAP_TEMPLATE({
      title: title,
      meta: meta,
      body: body,
      currentUrlAfterRedirect: originalUrl ? req.url : null,

      cssUrls: cssUrls,
      scriptUrls: scriptUrls,

      netproxyModulePath: PROXY_RESOURCE,
      clientProxyObjects: clientProxyObjects,

      requestWrap: requestWrap,
      controllerModulePath: controllerModuleResourcePath,
      allControllerArgs: allControllerArgs
    });

    // TODO(taylor): Render CSS before the preload is done.
    shouldFinish(200, {'Content-Type': 'text/html; charset=utf-8'}, html);
  };

  var controllersToLoadInOrder = [];
  var CurrentControllerKlass = ControllerKlass;
  while (CurrentControllerKlass) {
    controllersToLoadInOrder.unshift(CurrentControllerKlass);
    CurrentControllerKlass = CurrentControllerKlass.__parent__;
  }

  var navigation = controllerResources.objectsByModulePath[NAVIGATION_MODULE];

  var allControllerArgs = [];

  var loadNext = function() {
    var CurrentControllerKlass = controllersToLoadInOrder.shift();

    if (navigation) {
      navigation.__reset__(req.url);
    }

    var hasPreload = CurrentControllerKlass.prototype.hasOwnProperty('__preload__');
    var preload = CurrentControllerKlass.prototype.__preload__;
    if (!hasPreload) {
      preload = function defaultPreload(f) { f(); };
    }

    var failed = false;
    var timeout = setTimeout(function() {
      failed = true;

      shouldError(502, 'Preload never finished; call the function passed to __preload__ when finished loading.');
    }, 10000.0);

    preload.call(controller, function(var_args) {
      if (failed) {
        return;
      }
      clearTimeout(timeout);
      timeout = null;

      if (navigation) {
        if (navigation.__notfound__()) {
          shouldError(404, 'Resource not found at this path.');
          return;
        }

        var redirectUrl = navigation.__redirect__();
        if (redirectUrl) {
          shouldNavigate(redirectUrl);
          return;
        }
      }

      var controllerArgs = Array.prototype.slice.call(arguments);
      allControllerArgs.push(controllerArgs);

      var hasLoad = CurrentControllerKlass.prototype.hasOwnProperty('__load__');
      var load = hasLoad ? CurrentControllerKlass.prototype.__load__ : function defaultLoad() {};
      load.apply(controller, controllerArgs);

      if (!controllersToLoadInOrder.length) {
        renderFinal(allControllerArgs);
      } else {
        loadNext();
      }
    });
  };
  loadNext();
}


function serveController(req, res) {
  var start = +(new Date());
  
  loadRoot(DEBUG);

  var originalUrl = req.url;

  var loadNext = function(url, opt_originalUrl) {
    var fakeReq = {};
    for (var k in req) {
      fakeReq[k] = req[k];
    }
    fakeReq.url = url;

    renderControllerForRequest(fakeReq, opt_originalUrl, res,
        function shouldNavigate(toUrl) {
          console.log(' ->', fakeReq.url, 'redirected to', toUrl);
          loadNext(toUrl, originalUrl);
        },
        function shouldError(code, message, exception) {
          // TODO(Taylor): Custom 500/404 handlers injected here.
          console.log(' ->', fakeReq.url, code, (new Date()) - start, 'ms');
          renderError(res, exception, message, code)
        },
        function shouldFinish(code, headers, body) {
          console.log(' ->', fakeReq.url, code, (new Date()) - start, 'ms');
          res.writeHead(code, headers);
          res.end(body);
        });
  };

  loadNext(req.url);
}


function bodyContentTypeForResource(resource) {
  if (resource.getFunctionString) {
    var depsInWindow = resource.getAbsoluteDependencyPaths().map(function(globalDep) {
      return 'skit.objects[' + JSON.stringify(globalDep) + ']';
    });
    var body = 'skit.objects[' + JSON.stringify(resource.modulePath) + '] = ' +
                   '(' + resource.getFunctionString() + ')(' + depsInWindow.join(',') + ');';

    return {
      contentType: 'application/javascript',
      body: body,
    }

  } else {
    return {
      contentType: 'text/css',
      body: resource.getCssString()
    }

  }
}


function serveResource(req, res) {
  var modulePath = unescape(req.url.replace(RESOURCE_PREFIX, ''));
  var parts = modulePath.split(':');
  var resource;
  if (parts.length == 2) {
    var module = PACKAGE_ROOT.findNodeWithPath(parts[0]);
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
    'Cache-Control': 'public; no-cache'
  };

  var bodyContentType = bodyContentTypeForResource(resource);
  headers['Content-Type'] = bodyContentType.contentType;
  res.writeHead(200, headers);
  res.end(bodyContentType.body);
}


function serveStatic(req, res) {
  function error(err) {
    res.statusCode = err.status || 500;
    res.end(err.message);
  }

  var pathname = req.url.replace(STATIC_PREFIX, '');
  var maxAge = 0;
  if (!DEBUG) {
    maxAge = 365 * 24 * 60 * 60 * 1000;
  }

  var sent = send(req, pathname, {root: STATIC_PATH, maxage: maxAge});
  sent.on('error', error)
  sent.pipe(res);
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


// PUBLIC INTERFACE


function registerProxy(name, modifyRequest, modifyResponse) {
  PROXIES[name] = new ProxyHandler(name, modifyRequest, modifyResponse);
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


function setupPath(packagePath) {
  if (PACKAGE_PATH) {
    throw new Error('Cannot run multiple skits (yet). Sorry about that.');
  }

  PACKAGE_PATH = path.resolve(packagePath);
  STATIC_PATH = path.resolve(PACKAGE_PATH, STATIC_PREFIX.substring(1, STATIC_PREFIX.length - 1));
}


//
// OPTIMIZER
//


var uglify = require('uglify-js');


function staticFilename(filename, fileContent) {
  var parts = filename.split('.', 2);
  var md5 = crypto.createHash('md5').update(fileContent).digest('hex');
  parts[0] += '-v' + md5.substring(0, 12);
  return parts.join('.');
}


function buildOptimizedApp(packagePath, optimizedPackagePath) {
  setupPath(packagePath);

  // COMBINE MODULES FOR PUBLIC SERVING

  var moduleToStaticAliasMap = {};
  var allScripts = [];
  var allStylesheets = [];

  var jsFilename = path.join(STATIC_PREFIX, 'routes-combined.js');
  var cssFilename = path.join(STATIC_PREFIX, 'routes-combined.css');

  PUBLIC_ROUTES.forEach(function(route) {
    var controllerModule = PACKAGE_ROOT.findNodeWithPath(route.modulePath);
    var resources = loadResourcesForModule(controllerModule);

    resources.cssResources.forEach(function(css) {
      if (css.modulePath in moduleToStaticAliasMap) {
        return;
      }
      moduleToStaticAliasMap[css.modulePath] = cssFilename;

      var body = bodyContentTypeForResource(css).body;
      allStylesheets.push(body);
    });

    resources.scriptResources.forEach(function(script) {
      if (script.modulePath in moduleToStaticAliasMap) {
        return;
      }
      if (!script.includeInEnvironment(TargetEnvironment.BROWSER)) {
        return;
      }
      moduleToStaticAliasMap[script.modulePath] = jsFilename;

      var body = bodyContentTypeForResource(script).body;
      allScripts.push(body);
    });
  });

  // VERSION, UPDATE AND COPY ALL STATIC FILES

  var resolvedPackagePath = path.resolve(packagePath);
  if (resolvedPackagePath.charAt(resolvedPackagePath.length - 1) == '/') {
    resolvedPackagePath = resolvedPackagePath.substring(0, resolvedPackagePath.length - 1);
  }

  var allFiles = loader.walkSync(resolvedPackagePath);

  var filenameToContent = {};
  var staticFiles = [];
  var staticBasenames = {};

  allFiles.forEach(function(filename) {
    var basename = path.basename(filename);
    if (basename.indexOf('.') == 0) {
      return;
    }

    var relativeFilename = filename.replace(PACKAGE_PATH, '');

    var content = fs.readFileSync(filename);
    var stringContent = content + '';
    if (stringContent.indexOf('\ufffd') == -1) {
      content = stringContent;
    }

    filenameToContent[relativeFilename] = content;
    if (relativeFilename.indexOf(STATIC_PREFIX) == 0) {
      staticFiles.push(relativeFilename);
      staticBasenames[path.basename(relativeFilename)] = true;
    }
  });

  // Shunt these right in here so they get versioned and written out,
  // without having to actually do that manually.
  staticFiles.push(jsFilename);
  filenameToContent[jsFilename] = allScripts.join('\n');
  staticBasenames[path.basename(jsFilename)] = true;
  staticFiles.push(cssFilename);
  staticBasenames[path.basename(cssFilename)] = true;
  filenameToContent[cssFilename] = allStylesheets.join('\n');
  filenameToContent[ALIAS_MAP_FILENAME] = JSON.stringify(moduleToStaticAliasMap);

  var staticFilenamesIndex = {};
  staticFiles.forEach(function(filename) {
    var sfilename = staticFilename(filename, filenameToContent[filename]);
    // TODO(Taylor): Replace /__static__/ with https://foo/bar/.
    staticFilenamesIndex[filename] = sfilename;
  });

  var escapedBasenames = Object.keys(staticBasenames).map(function(basename) {
    return escapeRegex(basename);
  });
  var replaceContentRegex = new RegExp(
      "(['\"(])(/?(?:[\\w.-]+/)*(?:" + escapedBasenames.join('|') + "))(['\")])", 'g');

  var relativeFilenames = Object.keys(filenameToContent);
  relativeFilenames.forEach(function(filename) {
    if (!/\.(js|css|html|json)$/i.test(filename)) {
      return;
    }

    var original = filenameToContent[filename];
    if (!original.replace) {
      // Buffer, probably binary object.
      return;
    }

    filenameToContent[filename] = original.replace(replaceContentRegex, function(_, quote1, match, quote2) {
      if (match.indexOf('/') != 0 && match.indexOf('://') == -1) {
        match = path.join(path.dirname(filename), match);
      }
      if (match in staticFilenamesIndex) {
        console.log(filename, 'match:', match, '->', staticFilenamesIndex[match]);
        match = staticFilenamesIndex[match];
      }
      return quote1 + match + quote2;
    });
  });

  // WRITE ALL OPTIMIZED FILES TO DISK

  var optimizedPackagePath = path.resolve(optimizedPackagePath);
  loader.mkdirPSync(optimizedPackagePath);

  relativeFilenames.forEach(function(relativeFilename) {
    var destinationFilename = relativeFilename;
    if (relativeFilename in staticFilenamesIndex) {
      destinationFilename = staticFilenamesIndex[relativeFilename];
    }

    var absoluteFilename = path.join(optimizedPackagePath, destinationFilename);
    loader.mkdirPSync(path.dirname(absoluteFilename));

    var body = filenameToContent[relativeFilename];
    if (/\.js$/.test(relativeFilename) && relativeFilename.indexOf(STATIC_PREFIX) == 0) {
      console.log('minifying:', relativeFilename);
      body = uglify.minify(body, {fromString: true}).code;
    }

    fs.writeFileSync(absoluteFilename, body);
  });
}


//
// SERVER
//


function run(packagePath, opt_options) {
  setupPath(packagePath);

  var options = opt_options || {};
  var port = options.port || 3001;

  if (options.debug) {
    DEBUG = true;
  }

  try {
    RESOURCE_ALIAS_MAP = JSON.parse(fs.readFileSync(path.join(PACKAGE_PATH, ALIAS_MAP_FILENAME)) + '');
  } catch (e) {
    if (e.code != 'ENOENT') {
      throw e;
    }
  }

  var useStatic = false;
  try {
    var stat = fs.statSync(STATIC_PATH);
    useStatic = stat.isDirectory();
  } catch(e) {}

  var app = connect();
  app.use(compression());
  app.use(Cookies.express());
  app.use(bodyParser());
  app.use(function(req, res) {
    try {
      if (req.url.indexOf(RESOURCE_PREFIX) == 0) {
        serveResource(req, res);
      } else if (req.url.indexOf(PROXY_PREFIX) == 0) {
        serveProxy(req, res);
      } else if (useStatic && req.url.indexOf(STATIC_PREFIX) == 0) {
        serveStatic(req, res);
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
  'buildOptimizedApp': buildOptimizedApp,
};
