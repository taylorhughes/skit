'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var crypto = require('crypto');

var CSRF_COOKIE_PREFIX = 'csrf_';


function ProxyHandler(name, modifyRequest, modifyResponse) {
  this.name = name;
  this.modifyRequest_ = modifyRequest;
  this.modifyResponse_ = modifyResponse;
}

ProxyHandler.prototype.modifyRequest = function(proxyRequest, apiRequest) {
  this.modifyRequest_(proxyRequest, apiRequest);
};

ProxyHandler.prototype.modifyResponse = function(apiRequest, apiResponse, proxyResponse) {
  this.modifyResponse_(apiRequest, apiResponse, proxyResponse);
};

ProxyHandler.prototype.cookieName_ = function() {
  return CSRF_COOKIE_PREFIX + this.name;
};

ProxyHandler.prototype.verifyCSRF = function(req, token) {
  var cookieValue = req.getCookie(this.cookieName_());
  return token == cookieValue;
};

ProxyHandler.prototype.generateCSRF = function(req) {
  var cookieValue = req.getCookie(this.cookieName_());
  if (!cookieValue) {
    cookieValue = crypto.randomBytes(16).toString('base64');
    req.setCookie(this.cookieName_(), cookieValue, {httpOnly: true});
  }
  return cookieValue;
};

module.exports = ProxyHandler;