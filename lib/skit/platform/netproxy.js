'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var urls = skit.platform.urls;

var server = __module__.server;
var browser = __module__.browser;

var PROXIES = {};

var environment = server || browser;
var sendProxied = environment.sendProxied;


function __register__(name, proxyObject) {
  PROXIES[name] = proxyObject;
}


function getProxyNamed(name) {
  var proxyObject = PROXIES[name];
  if (!proxyObject) {
    throw new Error('Improperly configured: no proxy named ' + name);
  }

  return function() {
    // The arguments here are the same as skit.platform.net:send(),
    // we are adding the given proxy object to the front.
    var args = Array.prototype.slice.apply(arguments);
    args.unshift(proxyObject);
    sendProxied.apply(null, args);
  }
}

return {
  __register__: __register__,
  getProxyNamed: getProxyNamed
};
