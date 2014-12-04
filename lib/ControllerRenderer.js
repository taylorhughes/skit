'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var events = require('events');
var fs = require('fs');
var util = require('util');

var Handlebars = require('handlebars');

var loader = require('./loader/loader');
var scriptresource = require('./loader/scriptresource');
var skitutil = require('./skitutil');


var TargetEnvironment = scriptresource.TargetEnvironment;

Handlebars.registerHelper('json', function(arg) {
  return new Handlebars.SafeString(skitutil.safeJSONStringify(arg));
});

var BOOTSTRAP_TEMPLATE = (function() {
  var templateSource = fs.readFileSync(__dirname + '/bootstrap.html').toString();
  return Handlebars.compile(templateSource);  
})();

var NET_SERVER_MODULE = 'skit.platform.net:server';
var COOKIES_SERVER_MODULE = 'skit.platform.cookies:server';
var NAVIGATION_MODULE = 'skit.platform.navigation';
var PROXY_MODULE = 'skit.platform.netproxy';
var PROXY_RESOURCE = PROXY_MODULE + ':js';


function ControllerRenderer(server, controllerModule, request) {
  events.EventEmitter.apply(this);

  this.server = server;
  this.module = controllerModule;
  this.resources = loader.loadResourcesForModule(controllerModule);
  this.request = request;

  this.setupProxies_();
  this.setupNet_();
  this.setupCookies_();
};
util.inherits(ControllerRenderer, events.EventEmitter);


ControllerRenderer.ERROR = 'error';
ControllerRenderer.NOT_FOUND = 'notfound';
ControllerRenderer.REDIRECT = 'redirect';
ControllerRenderer.WRITE_HTML = 'html';
ControllerRenderer.DONE_WRITING = 'done';


ControllerRenderer.prototype.setupProxies_ = function() {
  var netproxy = this.resources.objectsByModulePath[PROXY_MODULE];
  if (!netproxy) {
    return;
  }

  this.server.eachProxy(function(name, proxy) {
    var reqWrap = {
      headers: this.request.headers,
      getCookie: this.request.getCookie
    };
    var resWrap = {
      getCookie: this.request.getCookie,
      setCookie: this.request.setCookie
    };

    var apiRequest;
    netproxy.__register__(name, {
      modifyRequestInternal: (function(apiRequest_) {
        apiRequest = apiRequest_;
        try {
          proxy.modifyRequest(reqWrap, apiRequest);
        } catch(e) {
          this.emit(ControllerRenderer.ERROR, e);
        }
      }).bind(this),
      modifyResponseInternal: (function(apiResponse) {
        try {
          proxy.modifyResponse(apiRequest, apiResponse, resWrap);
        } catch(e) {
          this.emit(ControllerRenderer.ERROR, e);
        }
      }).bind(this)
    }, this);
  }, this);
};


ControllerRenderer.prototype.setupNet_ = function() {
  var net = this.resources.objectsByModulePath[NET_SERVER_MODULE];
  if (!net) {
    return;
  }

  net.__setErrorHandler__((function(e) {
    this.emit(ControllerRenderer.ERROR, e);
  }).bind(this));
};


ControllerRenderer.prototype.setupCookies_ = function() {
  var cookies = this.resources.objectsByModulePath[COOKIES_SERVER_MODULE];
  if (!cookies) {
    return;
  }

  cookies.__setGetSet__(this.request.getCookie, this.request.setCookie);
};


ControllerRenderer.prototype.serve = function() {
  var ControllerKlass = this.resources.objectsByModulePath[this.module.modulePath];
  if (!ControllerKlass || !ControllerKlass.__controller__) {
    // Only controller modules should exist inside "public".
    var err = new Error('Module at this path is not a controller.');
    this.emit(ControllerRenderer.ERROR, err);
    return;
  }

  var headers = {};
  ['host', 'referer'].forEach(function(header) {
    headers[header] = this.request.headers[header];
  }, this);

  var requestWrap = {
    url: this.request.url,
    params: this.request.params,
    query: this.request.query,
    headers: headers,
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


ControllerRenderer.prototype.preloadController = function(ControllerKlass, onComplete) {
  var navigation = this.resources.objectsByModulePath[NAVIGATION_MODULE];
  if (navigation) {
    navigation.__reset__(this.request.url, this.request.headers['user-agent']);
  }

  var hasPreload = ControllerKlass.prototype.hasOwnProperty('__preload__');
  var preload = ControllerKlass.prototype.__preload__;
  if (!hasPreload) {
    preload = function defaultPreload(f) { f(); };
  }

  var preloadComplete = (function(var_args) {
    if (navigation) {
      if (navigation.__notfound__()) {
        this.emit(ControllerRenderer.NOT_FOUND);
        return;
      }

      var redirectUrl = navigation.__redirect__();
      if (redirectUrl) {
        this.emit(ControllerRenderer.REDIRECT, redirectUrl);
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
    this.emit(ControllerRenderer.ERROR, e);
  }
};


ControllerRenderer.prototype.render = function(ControllerKlass, allControllerArgs) {
  try {
    var title = this.controller.getFullTitle();
    var meta = this.controller.getFullMeta();
    var body = this.controller.renderFullBody();
  } catch (e) {
    this.emit(ControllerRenderer.ERROR, e);
    return;
  }

  var cssUrls = this.resources.cssResources.map(function(resource) {
    return this.server.getResourceUrl(resource);
  }, this);
  cssUrls = skitutil.unique(cssUrls);

  var scripts = this.resources.scriptResources;
  var scriptUrls = scripts.map(function(resource) {
    if (!resource.includeInEnvironment(TargetEnvironment.BROWSER)) {
      // continue
      return null;
    }
    return this.server.getResourceUrl(resource);
  }, this);
  scriptUrls = skitutil.unique(scriptUrls.filter(function(url) { return !!url; }));

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
  this.emit(ControllerRenderer.WRITE_HTML, html);
  this.emit(ControllerRenderer.DONE_WRITING);
};


module.exports = ControllerRenderer;
