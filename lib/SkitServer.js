'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var fs = require('fs');
var http = require('http');
var path = require('path');
var querystring = require('querystring');

var bodyParser = require('body-parser');
var connect = require('connect');
var compression = require('compression');
var Cookies = require('cookies');
var send = require('send');

var SkitProxy = require('./SkitProxy');
var SkitModule = require('./loader/SkitModule');
var ControllerServer = require('./ControllerServer');
var loader = require('./loader/loader');
var scriptresource = require('./loader/scriptresource');
var errors = require('./errors');
var util = require('./util');


var TargetEnvironment = scriptresource.TargetEnvironment;
var RESOURCE_PREFIX = '/__resource__/';
var PROXY_PREFIX = '/__proxy__/';
var DEFAULT_STATIC_PREFIX = '/__static__/';


function SkitServer(packagePath, options) {
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


SkitServer.prototype.registerProxy = function(name, modifyRequest, modifyResponse) {
  this.proxies_[name] = new SkitProxy(name, modifyRequest, modifyResponse);
};


SkitServer.prototype.eachProxy = function(fn, context) {
  Object.keys(this.proxies_).forEach(function(name) {
    fn.call(context, name, this.proxies_[name]);
  }, this);
};


SkitServer.prototype.listen = function(port) {
  var app = connect();
  app.use(compression());
  app.use(Cookies.express());
  app.use(bodyParser());
  app.use(this.serve.bind(this));

  var httpServer = http.createServer(app);
  httpServer.listen(port);
};


SkitServer.prototype.registerUrlArgument = function(name, pattern) {
  var match = /^\/([^\/]+)\/[a-z]*$/.exec('' + pattern);
  if (typeof name !== 'string' || !match) {
    throw new Error("Please provide a name (string, eg. '__id__') and a " +
        " pattern (RegExp, eg. /\\d{1,12}/ -- modifiers like ^, $, /mg " +
        " will be ignored.).");
  }
  this.urlArguments[name] = new RegExp('^' + match[1] + '$');
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
  var pathAndQuery = url.split('?', 2);
  var queryAndHash = (pathAndQuery[1] || '').split('#');
  var path = pathAndQuery[0];
  var query = queryAndHash[0] || '';
  var hash = queryAndHash[1] || '';
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
      this.serveProxy(req, res);
    } else if (req.url.indexOf(this.staticPrefix) == 1) { // leading slash is chopped off
      this.serveStatic(req, res);
    } else {
      this.serveController(req, res);
    }
  } catch (e) {
    console.log(' -> ', req.url, 'error: ' + e, 'stack:');
    console.log(e.stack);
    errors.renderError(res, e);
  }
};


SkitServer.prototype.serveController = function(req, res) {
  var start = +(new Date());

  if (this.debug) {
    delete this.root_;
  }

  if (!req.originalUrl) {
    req.originalUrl = req.url;
  }

  var loadNext = (function() {
    console.log('[controller request] ' + req.url);
    var moduleInfo = this.controllerAtUrl(req.url);
    if (!moduleInfo) {
      // TODO(Taylor): Render a 404 page here.
      errors.renderError(res, null, 'Could not find a module at this path.');
      return;
    }

    var controllerServer = new ControllerServer(this, moduleInfo.module, {
      url: req.url,
      originalUrl: req.originalUrl,
      headers: req.headers,

      path: moduleInfo.path,
      params: moduleInfo.urlArguments,
      query: moduleInfo.query,
      hash: module.hash,

      getCookie: req.cookies.get.bind(res.cookies),
      setCookie: res.cookies.set.bind(res.cookies),
    });

    controllerServer.serve(function() {
      if (controllerServer.redirectUrl) {
        console.log('[controller request] ' + req.url + ' redirected to ' + controllerServer.redirectUrl);
        req.url = controllerServer.redirectUrl;
        loadNext();

      } else if (controllerServer.errorMessage || controllerServer.exception) {
        errors.renderError(res, controllerServer.exception, controllerServer.errorMessage, controllerServer.code);

        var time = +(new Date()) - start;
        console.log('[controller request] ' + req.url + ' error ' + controllerServer.code + ' ' + time + ' ms');

      } else if (controllerServer.responseBody) {
        res.writeHead(controllerServer.code, controllerServer.responseHeaders || {});
        res.end(controllerServer.responseBody);

        var time = +(new Date()) - start;
        console.log('[controller request] ' + req.url + ' done in ' + time + ' ms');
      } else {
        errors.renderError(res, null, 'Unknown response from controller.');
      }
    });
  }).bind(this);

  loadNext();
};


SkitServer.prototype.serveProxy = function(req, res) {
  if (req.method != 'POST') {
    res.writeHead(405, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Method not allowed.');
    return;
  }

  var name = req.url.replace(PROXY_PREFIX, '');
  var proxy = this.proxies_[name];
  if (!proxy) {
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Could not find any proxy at this path.');
    return;
  }

  // TODO(Taylor): Unify the setCookie / getCookie interface with
  // platform.cookies.get/setCookie and ControllerServer.get/setCookie.
  var reqWrap = {
    getCookie: req.cookies.get.bind(req.cookies),
  };
  var resWrap = {
    getCookie: req.cookies.get.bind(req.cookies),
    setCookie: res.cookies.set.bind(req.cookies),
  };

  var csrfToken = req.body['csrfToken'];
  if (!proxy.verifyCSRF(reqWrap, csrfToken)) {
    console.log('Invalid CSRF token!');
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

  proxy.modifyRequest(reqWrap, apiRequest);

  var net = loader.loadObjectFromSkit('skit.platform.net');
  net.send(apiRequest.url, {
    method: apiRequest.method,
    headers: apiRequest.headers,
    body: apiRequest.body,
    complete: function(apiResponse) {
      try {
        proxy.modifyResponse(apiRequest, apiResponse, resWrap);
      } catch (e) {
        console.log('Proxy error: ' + e, e.stack);
        errors.renderError(res, e);
        return;
      }

      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify({
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
    console.log('Not found:', modulePath, parts);
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Could not find any resource at this path.');
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
  function error(err) {
    res.statusCode = err.status || 500;
    res.end(err.message);
  }

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
