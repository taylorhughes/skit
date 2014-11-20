'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var fs = require('fs');

var Handlebars = require('handlebars');

var loader = require('./loader/loader');
var scriptresource = require('./loader/scriptresource');
var util = require('./util');


var TargetEnvironment = scriptresource.TargetEnvironment;

Handlebars.registerHelper('json', function(arg) {
  return new Handlebars.SafeString(util.safeJSONStringify(arg));
});

var BOOTSTRAP_TEMPLATE = (function() {
  var templateSource = fs.readFileSync(__dirname + '/bootstrap.html').toString();
  return Handlebars.compile(templateSource);  
})();

var NET_SERVER_MODULE = 'skit.platform.net:server';
var NAVIGATION_MODULE = 'skit.platform.navigation';
var PROXY_MODULE = 'skit.platform.netproxy';
var PROXY_RESOURCE = PROXY_MODULE + ':js';


function ControllerServer(server, controllerModule, request) {
  this.server = server;
  this.module = controllerModule;
  this.resources = loader.loadResourcesForModule(controllerModule);
  this.request = request;

  this.code = null;
  this.responseHeaders = {};
  this.responseBody = null;
  this.exception = null;
  this.errorMessage = null;
  this.redirectUrl = null;

  this.setupProxies_();
  this.setupNet_();
};


ControllerServer.prototype.isDone = function() {
  return this.code !== null;
};

ControllerServer.prototype.maybeFinish = function() {
  if (this.isDone() && this.onResponse_) {
    this.onResponse_();
  }
};


ControllerServer.prototype.error = function(code, message, exception) {
  if (this.isDone()) {
    return;
  }

  this.code = code;
  this.errorMessage = message;
  this.exception = exception;

  this.maybeFinish();
};
ControllerServer.prototype.navigate = function(toUrl) {
  if (this.isDone()) {
    return;
  }

  this.code = 302;
  this.redirectUrl = toUrl;

  this.maybeFinish();
};
ControllerServer.prototype.finish = function(code, headers, body) {
  if (this.isDone()) {
    return;
  }

  this.code = 200;
  this.responseHeaders = headers;
  this.responseBody = body;

  this.maybeFinish();
};


ControllerServer.prototype.setupProxies_ = function() {
  var netproxy = this.resources.objectsByModulePath[PROXY_MODULE];
  if (!netproxy) {
    return;
  }

  this.server.eachProxy(function(name, proxy) {
    var reqWrap = {
      getCookie: this.request.getCookie
    };
    var resWrap = {
      getCookie: this.request.getCookie,
      setCookie: this.request.setCookie
    };

    var apiRequest;
    netproxy.__register__(name, {
      modifyRequest: (function(apiRequest_) {
        apiRequest = apiRequest_;
        try {
          proxy.modifyRequest(reqWrap, apiRequest);
        } catch(e) {
          this.error(502, 'Proxy modifyRequest error.', e);
        }
      }).bind(this),
      modifyResponse: (function(apiResponse) {
        try {
          proxy.modifyResponse(apiRequest, apiResponse, resWrap);
        } catch(e) {
          this.error(502, 'Proxy modifyResponse error.', e);
        }
      }).bind(this)
    }, this);
  }, this);
};


ControllerServer.prototype.setupNet_ = function() {
  var net = this.resources.objectsByModulePath[NET_SERVER_MODULE];
  if (!net) {
    return;
  }

  net.__setErrorHandler__((function(e) {
    this.error(502, 'Net error.', e);
  }).bind(this));
};


ControllerServer.prototype.serve = function(onResponse, opt_context) {
  this.onResponse_ = onResponse.bind(opt_context);

  var ControllerKlass = this.resources.objectsByModulePath[this.module.modulePath];
  if (!ControllerKlass || !ControllerKlass.__controller__) {
    this.error(404, this.module.modulePath + ' is not a controller. Use Controller.create({}) to define your controller.');
    return;
  }

  var requestWrap = {
    url: this.request.url,
    params: this.request.params,
    query: this.request.query,
  };
  this.controller = new ControllerKlass(requestWrap);

  var controllersToLoadInOrder = [];
  var CurrentControllerKlass = ControllerKlass;
  while (CurrentControllerKlass) {
    controllersToLoadInOrder.unshift(CurrentControllerKlass);
    CurrentControllerKlass = CurrentControllerKlass.__parent__;
  }

  var allControllerArgs = [];

  var loadNext = (function() {
    var CurrentControllerKlass = controllersToLoadInOrder.shift();
    if (!CurrentControllerKlass) {
      this.render(ControllerKlass, allControllerArgs);
      return;
    }

    this.preloadController(CurrentControllerKlass, function(controllerArgs) {
      allControllerArgs.push(controllerArgs);
      loadNext();
    });
  }).bind(this);

  loadNext();
};


ControllerServer.prototype.preloadTimedOut = function() {
  this.error(502, 'Preload never finished; call the function passed to __preload__ when finished loading.');
};


ControllerServer.prototype.preloadController = function(ControllerKlass, onComplete) {
  var navigation = this.resources.objectsByModulePath[NAVIGATION_MODULE];
  if (navigation) {
    navigation.__reset__(this.request.url, this.request.headers['user-agent']);
  }

  var hasPreload = ControllerKlass.prototype.hasOwnProperty('__preload__');
  var preload = ControllerKlass.prototype.__preload__;
  if (!hasPreload) {
    preload = function defaultPreload(f) { f(); };
  }

  var timeout = setTimeout(this.preloadTimedOut.bind(this), 10000.0);

  var preloadComplete = (function(var_args) {
    clearTimeout(timeout);

    if (this.isDone()) {
      return;
    }

    if (navigation) {
      if (navigation.__notfound__()) {
        this.error(404, 'Resource not found at this path.');
        return;
      }

      var redirectUrl = navigation.__redirect__();
      if (redirectUrl) {
        this.navigate(redirectUrl);
        return;
      }
    }

    var controllerArgs = Array.prototype.slice.call(arguments);

    var hasLoad = ControllerKlass.prototype.hasOwnProperty('__load__');
    var load = hasLoad ? ControllerKlass.prototype.__load__ : function defaultLoad() {};
    load.apply(this.controller, controllerArgs);

    onComplete(controllerArgs);
  }).bind(this);

  try {
    preload.call(this.controller, preloadComplete);
  } catch (e) {
    clearTimeout(timeout);
    this.error(502, 'Error during preload.', e);
  }
};


ControllerServer.prototype.render = function(ControllerKlass, allControllerArgs) {
  var title = '';
  var meta = '';
  var body = '';

  try {
    var currentKlass = ControllerKlass;
    while (currentKlass) {
      if (currentKlass.prototype.hasOwnProperty('__title__')) {
        title = currentKlass.prototype.__title__.call(this.controller, title);
      }
      if (currentKlass.prototype.hasOwnProperty('__meta__')) {
        meta = currentKlass.prototype.__meta__.call(this.controller, meta);
      }
      if (currentKlass.prototype.hasOwnProperty('__body__')) {
        body = currentKlass.prototype.__body__.call(this.controller, body);
      }
      currentKlass = currentKlass.__parent__;
    }
  } catch (e) {
    this.error(500, 'Error rendering content.', e);
    return;
  }

  var cssUrls = this.resources.cssResources.map(function(resource) {
    return this.server.getResourceUrl(resource);
  }, this);
  cssUrls = util.unique(cssUrls);

  var scripts = this.resources.scriptResources;
  var scriptUrls = scripts.map(function(resource) {
    if (!resource.includeInEnvironment(TargetEnvironment.BROWSER)) {
      // continue
      return null;
    }
    return this.server.getResourceUrl(resource);
  }, this);
  scriptUrls = util.unique(scriptUrls.filter(function(url) { return !!url; }));

  var clientProxyObjects = [];
  this.server.eachProxy(function(name, proxy) {
    clientProxyObjects.push({
      name: name,
      csrfToken: proxy.generateCSRF(this.request)
    });
  }, this);

  var controllerModuleResourcePath = scripts[scripts.length - 1].modulePath;
  var html = BOOTSTRAP_TEMPLATE({
    title: title,
    meta: meta,
    body: body,
    currentUrlAfterRedirect: this.request.originalUrl !== this.request.url ? this.request.url : null,

    cssUrls: cssUrls,
    scriptUrls: scriptUrls,

    netproxyModulePath: PROXY_RESOURCE,
    clientProxyObjects: clientProxyObjects,

    requestWrap: this.controller.request,
    controllerModulePath: controllerModuleResourcePath,
    allControllerArgs: allControllerArgs
  });

  // TODO(taylor): Render CSS before the preload is done.
  this.finish(200, {'Content-Type': 'text/html; charset=utf-8'}, html);
};


module.exports = ControllerServer;
