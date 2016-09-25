'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var crypto = require('crypto');

var CSRF_COOKIE_PREFIX = 'csrf_';

var X_FORWARDED_FOR = 'x-forwarded-for';
var X_FORWARDED_PROTO = 'x-forwarded-proto';


function SkitProxy(name, modifyRequest, modifyResponse) {
  this.name = name;
  this.modifyRequest_ = modifyRequest;
  this.modifyResponse_ = modifyResponse;
}

SkitProxy.prototype.modifyRequest = function(proxyRequest, apiRequest) {
  // Include the original remote IP and add our own to the forwarded list.
  var xForwardedFor = proxyRequest.headers[X_FORWARDED_FOR];
  var remoteIp = proxyRequest.connection.remoteAddress;
  if (xForwardedFor) {
    xForwardedFor += ', ' + remoteIp;
  } else {
    xForwardedFor = remoteIp;
  }
  apiRequest.headers[X_FORWARDED_FOR] = xForwardedFor;

  // Include whether the request was originally initiated over https.
  if (proxyRequest.headers[X_FORWARDED_PROTO]) {
    apiRequest.headers[X_FORWARDED_PROTO] = proxyRequest.headers[X_FORWARDED_PROTO];
  } else if (proxyRequest.connection.encrypted) {
    apiRequest.headers[X_FORWARDED_PROTO] = 'https';
  }

  this.modifyRequest_(proxyRequest, apiRequest);
};

SkitProxy.prototype.modifyResponse = function(apiRequest, apiResponse, proxyResponse) {
  this.modifyResponse_(apiRequest, apiResponse, proxyResponse);
};

SkitProxy.prototype.cookieName_ = function() {
  return CSRF_COOKIE_PREFIX + this.name;
};

SkitProxy.prototype.verifyCSRF = function(req, token) {
  var cookieValue = req.getCookie(this.cookieName_());
  if (token == cookieValue) {
    return true;
  }

  console.log('Invalid CSRF token:', token, typeof token, 'expected:', cookieValue, typeof cookieValue,
      req.headers['x-forwarded-for']);

  return false;
};

SkitProxy.prototype.generateCSRF = function(req) {
  var cookieValue = req.getCookie(this.cookieName_());
  if (!cookieValue) {
    cookieValue = crypto.randomBytes(16).toString('base64');
    req.setCookie(this.cookieName_(), cookieValue, {httpOnly: true});
  }
  return cookieValue;
};

module.exports = SkitProxy;