'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var fs = require('fs');
var http = require('http');
var path = require('path');
var urlparse = require('url');
var querystring = require('querystring');

var bodyParser = require('body-parser');
var connect = require('connect');
var compression = require('compression');
var Cookies = require('cookies');
var send = require('send');
var httpProxy = require('http-proxy');

var BundledLoader = require('./loader/BundledLoader');
var ControllerRenderer = require('./ControllerRenderer');
var SkitModule = require('./loader/SkitModule');
var SkitProxy = require('./SkitProxy');
var errors = require('./errors');
var loader = require('./loader/loader');
var pooledmoduleloader = require('./loader/pooledmoduleloader');
var scriptresource = require('./loader/scriptresource');
var skitutil = require('./skitutil');


var TargetEnvironment = scriptresource.TargetEnvironment;
var RESOURCE_PREFIX = '/__resource__/';
var PROXY_PREFIX = '/__proxy__/';
var DEFAULT_STATIC_PREFIX = '/__static__/';

var CONTROLLER_POOL = 'controller';


function controllerInModule_(skitModule) {
  if (!skitModule || skitModule instanceof SkitModule) {
    // Paths should not point directly at skit modules.
    return null;
  }

  var controllerModule = null;
  var children = skitModule.children();
  for (var i = 0; i < children.length; i++) {
    if (children[i] instanceof SkitModule) {
      controllerModule = children[i];
      break;
    }
  }

  return controllerModule;
}


/**
 * The main skit server. Start a skit server for a given base path to serve
 * controller modules, static resources and proxy requests for your project.
 *
 * @param {string} packagePath The path to the base directory for this
 *     skit-based project. "public", "__static__" should live in this
 *     directory.
 * @params {Object} options Options for this server, see below for individual
 *     option documentation.
 */
function SkitServer(packagePath, opt_options) {
  var options = opt_options || {};

  // This is the root where we find all the modules we can load with Skit.
  this.packagePath = path.resolve(packagePath);

  // Debug mode reloads the tree on every request.
  this.debug = !!options.debug;

  var publicRoot = options.publicRoot || 'public';
  var bundleConfiguration = options.bundleConfiguration || [{name: 'all', paths: ['/*']}];
  this.loader = new BundledLoader(this.packagePath, publicRoot, bundleConfiguration);

  pooledmoduleloader.setPoolSize(CONTROLLER_POOL, 10);

  // This is the name of the static files directory.
  this.staticPrefix = options.staticPrefix || DEFAULT_STATIC_PREFIX;
  if (this.staticPrefix.substring(0, 1) == '/') {
    this.staticPrefix = this.staticPrefix.slice(1);
  }
  if (this.staticPrefix.slice(-1) != '/') {
    this.staticPrefix += '/';
  }
  this.staticPath = path.resolve(this.packagePath, this.staticPrefix);

  this.staticWhitelist = {'robots.txt': 1, 'favicon.ico': 1};
  if (options.staticWhitelist) {
    options.staticWhitelist.forEach(function(whitelistedPath) {
      this.staticWhitelist[whitelistedPath] = 1;
    }, this);
  }

  // 30-second default request duration.
  this.requestTimeout = options.requestTimeout || 30000;

  // Whether to handle redirects on the server side (loading the next
  // controller in the same request).
  this.enableServerSideRedirects = !!options.enableServerSideRedirects;

  this.logResourceRequests = !!options.logResourceRequests;
  this.logStaticRequests = !!options.logStaticRequests;

  this.notFoundProxy = null;
  if (options.notFoundProxy) {
    this.notFoundProxy = httpProxy.createProxy({target: options.notFoundProxy});
    this.notFoundProxy.on('error', function(err, req, res) {
      console.log('[skit not found proxy]', 'closing response due to error:', err);
      res.end();
    });
  }

  // Internal:

  this.urlArguments = {};
  if (options.urlArguments) {
    Object.keys(options.urlArguments).forEach(function(name) {
      this.registerUrlArgument(name, options.urlArguments[name]);
    }, this);
  }

  this.aliasMap = {};
  if (options.aliasMap) {
    this.aliasMap = JSON.parse(fs.readFileSync(path.join(this.packagePath, options.aliasMap)) + '');
  }

  this.proxies_ = {};
}


/** 
 * Register a proxy handler. This is how we can keep secrets for API requests
 * living on the server only, and how we avoid CORS issues by running
 * client-side requests through our local server.
 *
 * @param {string} name The name of the proxy, to be used in code calling
 *     into net with the "proxy" parameter.
 * @param {Function} modifyRequest A function to modify the API request before
 *     it is sent, on the server side.
 * @param {Function} modifyResponse A function to modify the API response before
 *     it is returned to the client, on the server side.
 */
SkitServer.prototype.registerProxy = function(name, modifyRequest, modifyResponse) {
  this.proxies_[name] = new SkitProxy(name, modifyRequest, modifyResponse);
};


/**
 * Register a special directory name in the "public" root to treat as a URL
 * argument. This is how we support regex-based paths.
 *
 * @param {string} name The name of the directory to rename, eg. "__id__".
 * @param {RegExp} pattern The pattern for the argument, eg. /\d+/.
 */
SkitServer.prototype.registerUrlArgument = function(name, pattern) {
  var match = /^\/([^\/]+)\/[a-z]*$/.exec('' + pattern);
  if (typeof name !== 'string' || !match) {
    throw new Error("Please provide a name (string, eg. '__id__') and a " +
        " pattern (RegExp, eg. /\\d{1,12}/ -- modifiers like ^, $, /mg " +
        " will be ignored.).");
  }
  this.urlArguments[name] = new RegExp('^' + match[1] + '$');
};


/**
 * Start the skit server listening on a given port.
 *
 * @param {number} port The port to listen on.
 */
SkitServer.prototype.listen = function(port) {
  var app = connect();
  var self = this;
  app.use(function(req, res, next) {
    var start = +(new Date());
    var end = res.end;
    res.end = function() {
      var shouldLog = true;
      var isStatic = req.url.indexOf(self.staticPrefix) >= 0;
      if (isStatic) {
        shouldLog = self.logStaticRequests;
      }
      var isResource = req.url.indexOf(RESOURCE_PREFIX) >= 0;
      if (isResource) {
        shouldLog = self.logResourceRequests;
      }

      if (shouldLog) {
        var time = new Date() - start;
        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '-';
        console.log(ip, '-', req.headers['host'], '-', '"' + req.method, req.url, 'HTTP/1.1"',
            res.statusCode, time + 'ms', '"' + (req.headers['referer'] || '-') + '"', '"' + (req.headers['user-agent'] || '-') + '"');
      }

      end.apply(res, arguments);
    };

    next();
  });
  app.use(compression());
  app.use(Cookies.express());
  app.use(this.serve.bind(this));

  var httpServer = http.createServer(app);
  httpServer.listen(port);
};


SkitServer.prototype.eachProxy = function(fn, context) {
  Object.keys(this.proxies_).forEach(function(name) {
    fn.call(context, name, this.proxies_[name]);
  }, this);
};


SkitServer.prototype.controllerAtUrl = function(url) {
  var pathAndQuery = url.split('?');
  var queryAndHash = (pathAndQuery.slice(1).join('?')).split('#');
  var path = pathAndQuery[0];
  var query = queryAndHash[0] || '';
  var hash = queryAndHash.slice(1).join('#');
  var pathParts = path.split('/');
  if (pathParts[0] == '') {
    // path starts with a slash
    pathParts = pathParts.slice(1);
  }
  if (pathParts.slice(-1) == '') {
    // path ends with a slash
    pathParts = pathParts.slice(0, -1);
  }

  var namedArguments = {};
  var currentNode = this.loader.getPublicRoot();
  for (var i = 0; i < pathParts.length; i++) {
    var currentPart = pathParts[i];

    var nextNode = currentNode.getChildWithName(currentPart);
    if (!nextNode) {
      var currentMatchers = currentNode.childNames();
      for (var j = 0; !nextNode && j < currentMatchers.length; j++) {
        var matcher = currentMatchers[j];
        if (matcher in this.urlArguments) {
          var match = currentPart.match(this.urlArguments[matcher]);
          if (match) {
            namedArguments[matcher] = match[0];
            nextNode = currentNode.getChildWithName(matcher);
          }
        } else if (matcher.match(/^__[a-z][\w-]*__$/i)) {
          // unnamed, generic matcher matches anything.
          namedArguments[matcher] = currentPart;
          nextNode = currentNode.getChildWithName(matcher);
        }
      }
    }

    if (!nextNode) {
      currentNode = null;
      break;
    }
    currentNode = nextNode;
  }

  var controllerModule = currentNode && controllerInModule_(currentNode);
  return {
    module: controllerModule,
    requestInfo: {
      params: namedArguments,
      path: path,
      query: querystring.parse(query),
      hash: hash,
    },
  };
};


SkitServer.prototype.getResourceUrl = function(resource) {
  if (resource.resourcePath in this.aliasMap) {
    return this.aliasMap[resource.resourcePath];
  }
  return RESOURCE_PREFIX + escape(resource.resourcePath);
};


SkitServer.prototype.serve = function(req, res) {
  req.originalUrl = req.url;

  try {
    if (req.url.indexOf(RESOURCE_PREFIX) == 0) {
      this.serveResource(req, res);
    } else if (req.url.indexOf(PROXY_PREFIX) == 0) {
      // Decode the body here first; no other endpoints need body parsing.
      bodyParser()(req, res, (function() {
        this.serveProxy(req, res);
      }).bind(this));
    } else if (req.url.indexOf(this.staticPrefix) == 1 || req.url.slice(1) in this.staticWhitelist) {
      this.serveStatic(req, res);
    } else {
      if (this.debug) {
        this.loader.reload();
        pooledmoduleloader.resetPool(CONTROLLER_POOL);
      }
      this.serveControllerFromRequest(req, res);
    }
  } catch (e) {
    this.renderError(req, res, e);
  }
};


SkitServer.prototype.renderRedirect = function(req, res, redirectUrl, opt_permanent, opt_error) {
  if (this.enableServerSideRedirects && !opt_error) {
    console.log('[skit] server-side redirect:', req.url, '->', redirectUrl);
    req.url = redirectUrl;
    this.serveControllerFromRequest(req, res);
    return;
  }

  res.writeHead(opt_permanent ? 301 : 302, {'Location': redirectUrl});
  res.end();
};


SkitServer.prototype.renderCustomError = function(code, req, res, opt_error) {
  var publicNode = this.loader.getPublicRoot();
  var errorControllerModule = publicNode.getChildWithName('__' + code + '__'); // eg. __404__
  if (errorControllerModule) {
    var errorController = controllerInModule_(errorControllerModule);
    if (errorController) {
      if (req['renderingCustomError' + code]) {
        console.log('[skit] Cannot process nested custom error handlers; falling back to default view for ' + code);
        return false;
      }

      var requestInfo = this.controllerAtUrl(req.url).requestInfo;
      if (opt_error) {
        requestInfo.params['__error__'] = opt_error + '';
      }

      req['renderingCustomError' + code] = true;
      this.serveController(errorController, requestInfo, req, res, code);
      return true;
    }
  }

  return false;
};


SkitServer.prototype.renderError = function(req, res, e) {
  if (this.debug) {
    errors.renderError(req, res, e);
    return;
  }

  if ((e && e.status) != 403) {
    console.log('Error processing request:', req.url, e.stack || e + '');
  }

  if (this.renderCustomError(502, req, res, e)) {
    return;
  }

  res.writeHead(502);
  res.end('Error processing request.');
};


SkitServer.prototype.renderNotFound = function(req, res) {
  if (req.originalUrl != req.url) {
    // server-side redirect; actually perform a redirect in this case
    // to correct the client-side URL.
    this.renderRedirect(req, res, req.url, false, true);
    return;
  }

  if (this.notFoundProxy) {
    this.notFoundProxy.proxyRequest(req, res);
    return;
  }

  if (this.renderCustomError(404, req, res)) {
    return;
  }

  res.writeHead(404);
  res.end('Resource not found.');
};


SkitServer.prototype.serveControllerFromRequest = function(req, res) {
  var moduleInfo = this.controllerAtUrl(req.url);
  if (!moduleInfo.module) {
    this.renderNotFound(req, res);
    return;
  }

  this.serveController(moduleInfo.module, moduleInfo.requestInfo, req, res);
};


SkitServer.prototype.serveController = function(controllerModule, requestInfo, req, res, opt_code) {
  pooledmoduleloader.borrowModuleScope(CONTROLLER_POOL, controllerModule, function(scope) {
    try {
      this.serveControllerScoped_(scope, requestInfo, req, res, opt_code);
    } catch (e) {
      scope.release();
      this.renderError(req, res, e);
    }
  }, this);
};


SkitServer.prototype.serveControllerScoped_ = function(scope, requestInfo, req, res, opt_code) {
  var bundles = this.loader.bundlesRequiredForModule(scope.module);

  var controllerRenderer = new ControllerRenderer(scope, bundles, this, {
    url: req.url,
    originalUrl: req.originalUrl,
    headers: req.headers,

    path: requestInfo.path,
    params: requestInfo.params,
    query: requestInfo.query,

    getCookie: req.cookies.get.bind(res.cookies),
    setCookie: res.cookies.set.bind(res.cookies),
  });

  var timeout = setTimeout((function() {
    done();

    // Common cause: __preload__ not calling the callback argument?
    var err = new Error('Request timed out.');
    this.renderError(req, res, err);
  }).bind(this), this.requestTimeout);

  var done = function() {
    clearTimeout(timeout);
    controllerRenderer.removeAllListeners();
    scope.release();
  };

  controllerRenderer.on(ControllerRenderer.REDIRECT, (function(redirectUrl) {
    done();
    this.renderRedirect(req, res, redirectUrl);
  }).bind(this));
  controllerRenderer.on(ControllerRenderer.ERROR, (function(err) {
    done();
    this.renderError(req, res, err);
  }).bind(this));
  controllerRenderer.on(ControllerRenderer.NOT_FOUND, (function(err) {
    done();
    this.renderNotFound(req, res);
  }).bind(this));

  var headWritten = false;
  controllerRenderer.on(ControllerRenderer.WRITE_HTML, (function(html) {
    if (!headWritten) {
      res.writeHead(opt_code || 200, {'Content-Type': 'text/html; charset=utf8'});
    }
    res.write(html);
  }).bind(this));
  controllerRenderer.on(ControllerRenderer.DONE_WRITING, (function() {
    done();
    res.end();
  }).bind(this));

  controllerRenderer.serve();
};


SkitServer.prototype.serveProxy = function(req, res) {
  if (req.method != 'POST') {
    var err = new Error('Method not allowed');
    err.status = 405;
    this.renderError(req, res, err);
    return;
  }

  var name = req.url.replace(PROXY_PREFIX, '');
  var proxy = this.proxies_[name];
  if (!proxy) {
    this.renderNotFound(req, res);
    return;
  }

  // TODO(Taylor): Unify the setCookie / getCookie interface with
  // platform.cookies.get/setCookie and ControllerServer.get/setCookie.
  var reqWrap = {
    headers: req.headers,
    getCookie: req.cookies.get.bind(req.cookies),
  };
  var resWrap = {
    getCookie: req.cookies.get.bind(req.cookies),
    setCookie: res.cookies.set.bind(req.cookies),
  };

  var csrfToken = req.body['csrfToken'];
  if (!proxy.verifyCSRF(reqWrap, csrfToken)) {
    var err = new Error('Invalid CSRF token.');
    err.status = 403;
    this.renderError(req, res, err);
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

  proxy.modifyRequest(reqWrap, apiRequest);

  var self = this;
  loader.globalScopedLoaderForModule('skit.platform.net', function(scope) {
    var net = scope.mainObject;

    net.send(apiRequest.url, {
      method: apiRequest.method,
      headers: apiRequest.headers,
      body: apiRequest.body,
      complete: function(apiResponse) {
        // Done with the scope.
        scope.release();

        try {
          proxy.modifyResponse(apiRequest, apiResponse, resWrap);
        } catch (e) {
          self.renderError(req, res, e);
          return;
        }

        res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
        res.end(skitutil.safeJSONStringify({
          'status': apiResponse.status,
          'headers': apiResponse.headers,
          'body': apiResponse.body
        }));
      }
    });
  });
};


SkitServer.prototype.serveResource = function(req, res) {
  var resourcePath = unescape(req.url.replace(RESOURCE_PREFIX, ''));
  var parts = resourcePath.split(':');

  var resource;
  if (parts.length == 2) {
    resource = this.loader.resourceAtModulePath(parts[0], parts[1]);
  }

  if (!resource) {
    this.renderNotFound(req, res);
    return;
  }

  var headers = {
    'Cache-Control': 'public; no-cache'
  };

  var bodyContentType = resource.bodyContentType();
  headers['Content-Type'] = bodyContentType.contentType;
  res.writeHead(200, headers);
  res.end(bodyContentType.body);
};


SkitServer.prototype.serveStatic = function(req, res) {
  var error = (function(err) {
    if (err.status != 404) {
      this.renderError(req, res, err);
    } else {
      this.renderNotFound(req, res);
    }
  }).bind(this);

  var pathname = req.url.replace(this.staticPrefix, '');
  var maxAge = 0;
  if (!this.debug) {
    maxAge = 365 * 24 * 60 * 60 * 1000;
  }

  var sent = send(req, pathname, {root: this.staticPath, maxage: maxAge});
  sent.on('error', error)
  sent.pipe(res);
};


module.exports = SkitServer;
