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

var SkitProxy = require('./SkitProxy');
var SkitModule = require('./loader/SkitModule');
var ControllerRenderer = require('./ControllerRenderer');
var loader = require('./loader/loader');
var scriptresource = require('./loader/scriptresource');
var errors = require('./errors');
var skitutil = require('./skitutil');


var TargetEnvironment = scriptresource.TargetEnvironment;
var RESOURCE_PREFIX = '/__resource__/';
var PROXY_PREFIX = '/__proxy__/';
var DEFAULT_STATIC_PREFIX = '/__static__/';



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


SkitServer.prototype.root = function(opt_force) {
  if (!this.root_) {
    console.log('[skit] Loading root in: ' + this.packagePath);
    this.root_ = loader.load(this.packagePath);

    var publicRoot = this.root_.getChildWithName('public');
    if (!publicRoot) {
      throw new Error('Could not find public root.');
    }
  }
  return this.root_;
};


SkitServer.prototype.controllerAtUrl = function(url) {
  var pathAndQuery = url.split('?');
  var queryAndHash = (pathAndQuery.slice(1).join('?')).split('#');
  var path = pathAndQuery[0];
  var query = queryAndHash[0] || '';
  var hash = queryAndHash.slice(1).join('#');
  var pathParts = path.split('/');
  if (pathParts[0] == '') {
    pathParts = pathParts.slice(1);
  }
  if (pathParts.slice(-1) == '') {
    pathParts = pathParts.slice(0, -1);
  }

  var namedArguments = {};
  var currentNode = this.root().getChildWithName('public');
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
        } else if (matcher.match(/^__[\w-]+__$/)) {
          // unnamed, generic matcher matches anything.
          namedArguments[matcher] = currentPart;
          nextNode = currentNode.getChildWithName(matcher);
        }
      }
    }

    if (!nextNode) {
      return null;
    }
    currentNode = nextNode;
  }

  if (!currentNode || currentNode instanceof SkitModule) {
    // Paths should not point directly at skit modules.
    return null;
  }

  var controllerModule;
  var children = currentNode.children();
  for (var i = 0; i < children.length; i++) {
    if (children[i] instanceof SkitModule) {
      controllerModule = children[i];
      break;
    }
  }

  if (!controllerModule) {
    return null;
  }

  return {
    module: controllerModule,
    urlArguments: namedArguments,
    path: path,
    query: querystring.parse(query),
    hash: hash,
  };
};


SkitServer.prototype.globalCssResources = function() {
  if (!this.debug) {
    return [];
  }

  var publicRoot = this.root().getChildWithName('public');
  return loader.loadAllCssResourcesInModule(publicRoot);
};


SkitServer.prototype.getResourceUrl = function(resource) {
  if (resource.modulePath in this.aliasMap) {
    return this.aliasMap[resource.modulePath];
  }
  return RESOURCE_PREFIX + escape(resource.modulePath);
};


SkitServer.prototype.serve = function(req, res) {
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
      this.serveController(req, res);
    }
  } catch (e) {
    this.renderError(req, res, e);
  }
};


SkitServer.prototype.renderError = function(req, res, e) {
  if (this.debug) {
    errors.renderError(req, res, e);
  } else {
    if ((e && e.status) != 403) {
      // TODO(Taylor): Support custom error pages here.
      console.log('Error processing request:', req.url, e.stack || e + '');
    }
    res.status = 502;
    res.end('Error processing request.');
  }
};


SkitServer.prototype.renderRedirect = function(req, res, redirectUrl, opt_permanent) {
  res.writeHead(opt_permanent ? 301 : 302, {'Location': redirectUrl});
  res.end();
};


SkitServer.prototype.renderNotFound = function(req, res) {
  if (req.originalUrl != req.url) {
    // server-side redirect; actually perform a redirect in this case
    // to correct the client-side URL.
    this.renderRedirect(req, res, req.url);
    return;
  }

  if (this.notFoundProxy) {
    this.notFoundProxy.proxyRequest(req, res);
    return;
  }

  // TODO(Taylor): Support custom/nice 404 page here.
  res.writeHead(404);
  res.end('Resource not found.');
};


SkitServer.prototype.serveController = function(req, res) {
  if (this.debug) {
    delete this.root_;
  }

  if (!req.originalUrl) {
    req.originalUrl = req.url;
  }

  var self = this;

  var loadNext = function() {
    try {
      loadNextInner_();
    } catch (e) {
      self.renderError(req, res, e);
    }
  };

  var loadNextInner_ = function() {
    var moduleInfo = self.controllerAtUrl(req.url);
    if (!moduleInfo) {
      self.renderNotFound(req, res);
      return;
    }

    var controllerRenderer = new ControllerRenderer(self, moduleInfo.module, {
      url: req.url,
      originalUrl: req.originalUrl,
      headers: req.headers,

      path: moduleInfo.path,
      params: moduleInfo.urlArguments,
      query: moduleInfo.query,

      getCookie: req.cookies.get.bind(res.cookies),
      setCookie: res.cookies.set.bind(res.cookies),
    });

    var timeout = setTimeout(function() {
      controllerRenderer.removeAllListeners();

      // Common cause: __preload__ not calling the callback argument?
      var err = new Error('Request timed out.');
      self.renderError(req, res, err);
    }, self.requestTimeout);

    var done = function() {
      clearTimeout(timeout);
      controllerRenderer.removeAllListeners();
    };

    controllerRenderer.on(ControllerRenderer.REDIRECT, function(redirectUrl) {
      done();
      if (self.enableServerSideRedirects) {
        console.log('[skit] server-side redirect:', req.url, '->', redirectUrl);
        req.url = redirectUrl;
        loadNext();
      } else {
        self.renderRedirect(req, res, redirectUrl);
      }
    });
    controllerRenderer.on(ControllerRenderer.ERROR, function(err) {
      done();
      self.renderError(req, res, err);
    });
    controllerRenderer.on(ControllerRenderer.NOT_FOUND, function(err) {
      done();
      self.renderNotFound(req, res);
    });

    var headWritten = false;
    controllerRenderer.on(ControllerRenderer.WRITE_HTML, function(html) {
      if (!headWritten) {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf8'});
      }
      res.write(html);
    });
    controllerRenderer.on(ControllerRenderer.DONE_WRITING, function() {
      done();
      res.end();
    });

    controllerRenderer.serve();
  };

  loadNext();
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
  var net = loader.loadObjectFromSkit('skit.platform.net');
  net.send(apiRequest.url, {
    method: apiRequest.method,
    headers: apiRequest.headers,
    body: apiRequest.body,
    complete: function(apiResponse) {
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
};


SkitServer.prototype.serveResource = function(req, res) {
  var modulePath = unescape(req.url.replace(RESOURCE_PREFIX, ''));
  var parts = modulePath.split(':');
  var resource;
  if (parts.length == 2) {
    var module = this.root().findNodeWithPath(parts[0]);
    if (module) {
      resource = module.getResourceNamed(parts[1]);
    }
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
