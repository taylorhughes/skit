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

var scriptresource = require('./loader/scriptresource');
var skitutil = require('./skitutil');


var TargetEnvironment = scriptresource.TargetEnvironment;

Handlebars.registerHelper('json', function(arg, opt_pretty) {
  try {
    return new Handlebars.SafeString(skitutil.safeJSONStringify(arg, opt_pretty));
  } catch (e) {
    var err = new Error('Could not JSON-encode object: ' + arg);
    err.originalError = e;
    throw err;
  }
});

var BOOTSTRAP_TEMPLATE = (function() {
  var templateSource = fs.readFileSync(__dirname + '/bootstrap.html').toString();
  return Handlebars.compile(templateSource);
})();

var NET_SERVER_MODULE = 'skit.platform.net:server';
var ENV_SERVER_MODULE = 'skit.platform.env:server';
var COOKIES_SERVER_MODULE = 'skit.platform.cookies:server';
var NAVIGATION_MODULE = 'skit.platform.navigation:server';
var PROXY_MODULE = 'skit.platform.netproxy';
var PROXY_RESOURCE = PROXY_MODULE + ':js';


function ControllerRenderer(moduleScope, bundles, server, request) {
  events.EventEmitter.apply(this);

  this.moduleScope = moduleScope;
  this.bundles = bundles;
  this.server = server;
  this.request = request;

  this.setupProxies_();
  this.setupNet_();
  this.setupCookies_();
  this.setupEnv_();
}
util.inherits(ControllerRenderer, events.EventEmitter);


ControllerRenderer.ERROR = 'rendererror';
ControllerRenderer.NOT_FOUND = 'notfound';
ControllerRenderer.REDIRECT = 'redirect';
ControllerRenderer.WRITE_HTML = 'html';
ControllerRenderer.DONE_WRITING = 'done';


ControllerRenderer.prototype.setupProxies_ = function() {
  var netproxy = this.moduleScope.getObjectByModulePath(PROXY_MODULE);
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
  var net = this.moduleScope.getObjectByResourcePath(NET_SERVER_MODULE);
  if (!net) {
    return;
  }

  net.__setErrorHandler__((function(e) {
    this.emit(ControllerRenderer.ERROR, e);
  }).bind(this));
};


ControllerRenderer.prototype.setupCookies_ = function() {
  var cookies = this.moduleScope.getObjectByResourcePath(COOKIES_SERVER_MODULE);
  if (!cookies) {
    return;
  }

  cookies.__setGetSet__(this.request.getCookie, this.request.setCookie);
};


ControllerRenderer.prototype.setupEnv_ = function() {
  var env = this.moduleScope.getObjectByResourcePath(ENV_SERVER_MODULE);
  if (!env) {
    return;
  }

  env.__setEnv__(this.server.env);
};


ControllerRenderer.prototype.serve = function() {
  var ControllerKlass = this.moduleScope.mainObject;
  if (!ControllerKlass || !ControllerKlass.__controller__) {
    // Only controller modules should exist inside "public".
    var err = new Error('Module at this path is not a controller.');
    this.emit(ControllerRenderer.ERROR, err);
    return;
  }

  this.controller = new ControllerKlass(this.request.params);

  var initialControllerProperties = {};
  for (var k in this.controller) {
    if (this.controller.hasOwnProperty(k)) {
      initialControllerProperties[k] = this.controller[k];
    }
  }

  var controllersToLoadInOrder = [];
  var CurrentControllerKlass = ControllerKlass;
  while (CurrentControllerKlass) {
    controllersToLoadInOrder.unshift(CurrentControllerKlass);
    CurrentControllerKlass = CurrentControllerKlass.__parent__;
  }

  var i = 0;
  var preloadNext = (function() {
    var CurrentControllerKlass = controllersToLoadInOrder[i++];
    if (!CurrentControllerKlass) {
      loadAndRender();
      return;
    }

    this.preloadController(CurrentControllerKlass, preloadNext);
  }).bind(this);

  var loadAndRender = (function() {
    var controllerProperties = {};
    for (var k in this.controller) {
      if (this.controller.hasOwnProperty(k) && initialControllerProperties[k] != this.controller[k]) {
        controllerProperties[k] = this.controller[k];
      }
    }

    this.controller.recursiveLoad();

    this.render(controllerProperties);
  }).bind(this);

  preloadNext();
};


ControllerRenderer.prototype.preloadController = function(ControllerKlass, onComplete) {
  var scheme = this.request.headers['x-forwarded-proto'] || 'http';
  var schemeAndHost = scheme + '://' + this.request.headers['host'];

  var navigation = this.moduleScope.getObjectByResourcePath(NAVIGATION_MODULE);
  if (navigation) {
    var fullUrl = schemeAndHost + this.request.url;
    navigation.__reset__(fullUrl, this.request.headers['user-agent'], this.request.headers['referer']);
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

      var redirects = navigation.__redirects__();
      if (redirects && redirects.length) {
        var lastRedirect = redirects[redirects.length - 1];
        var redirectUrl = lastRedirect.url;
        if (redirectUrl.indexOf(schemeAndHost) == 0) {
          redirectUrl = redirectUrl.replace(schemeAndHost, '');
        }
        this.emit(ControllerRenderer.REDIRECT, redirectUrl, !!lastRedirect.permanent);
        return;
      }
    }

    onComplete();
  }).bind(this);

  try {
    preload.call(this.controller, preloadComplete);
  } catch (e) {
    this.emit(ControllerRenderer.ERROR, e);
  }
};


ControllerRenderer.prototype.render = function(controllerProperties) {
  try {
    var title = this.controller.getFullTitle();
    var meta = this.controller.getFullMeta();
    var body = this.controller.renderFullBody();
  } catch (e) {
    this.emit(ControllerRenderer.ERROR, e);
    return;
  }

  var cssUrls = {};
  var jsUrls = {};

  var cssBundleUrls = [];
  var jsBundleUrls = [];

  this.bundles.forEach(function(bundle) {
    bundle.allStyles().forEach(function(resource) {
      var css = this.server.getResourceUrl(resource);
      var cssUrl = css.path || css;
      var integrity = css.integrity || null;
      if (!(cssUrl in cssUrls)) {
        cssUrls[cssUrl] = 1;
        cssBundleUrls.push({
          bundle: bundle.name,
          url: cssUrl,
          integrity: integrity,
        });
      }
    }, this);

    bundle.allScripts().forEach(function(resource) {
      if (resource.includeInEnvironment(TargetEnvironment.BROWSER)) {
        var js = this.server.getResourceUrl(resource);
        var jsUrl = js.path || js;
        var integrity = js.integrity || null;
        if (!(jsUrl in jsUrls)) {
          jsUrls[jsUrl] = 1;
          jsBundleUrls.push({
            bundle: bundle.name,
            url: jsUrl,
            integrity: integrity,
          });
        }
      }
    }, this);
  }, this);

  var clientProxyObjects = [];
  this.server.eachProxy(function(name, proxy) {
    clientProxyObjects.push({
      name: name,
      csrfToken: proxy.generateCSRF(this.request)
    });
  }, this);

  var html = BOOTSTRAP_TEMPLATE({
    title: title,
    meta: meta,
    body: body,
    currentUrlAfterRedirect: this.request.originalUrl !== this.request.url ? this.request.url : null,

    env: this.server.env,

    cssUrls: cssBundleUrls,
    jsUrls: jsBundleUrls,

    netproxyModulePath: PROXY_RESOURCE,
    clientProxyObjects: clientProxyObjects,

    params: this.request.params,
    controllerModulePath: this.moduleScope.mainObjectResourcePath,
    controllerProperties: controllerProperties,
  });

  // TODO(taylor): Render CSS before the preload is done.
  this.emit(ControllerRenderer.WRITE_HTML, html);
  this.emit(ControllerRenderer.DONE_WRITING);
};


module.exports = ControllerRenderer;
