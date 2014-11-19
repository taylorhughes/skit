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
  this.modifyRequest = modifyRequest;
  this.modifyResponse = modifyResponse;
}

ProxyHandler.prototype.cookieName_ = function() {
  return CSRF_COOKIE_PREFIX + this.name;
}

ProxyHandler.prototype.verifyCSRF = function(req, token) {
  // TODO(taylor): Verify CSRF token is valid by checking against
  // aforementioned crypto secret.
  var cookieValue = req.getCookie(this.cookieName_());
  return token == cookieValue;
};

ProxyHandler.prototype.generateCSRF = function(req) {
  // TODO(taylor): Create CSRF crypto secret based on name, then
  // generate a time-sensitive token here.
  var cookieValue = req.getCookie(this.cookieName_());
  if (!cookieValue) {
    cookieValue = crypto.randomBytes(16).toString('base64');
    req.setCookie(this.cookieName_(), cookieValue, {httpOnly: true});
  }
  return cookieValue;
};

module.exports = ProxyHandler;