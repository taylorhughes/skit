'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var crypto = require('crypto');


function ProxyHandler(name, modifyRequest, modifyResponse) {
  this.name = name;
  this.modifyRequest = modifyRequest;
  this.modifyResponse = modifyResponse;
}

ProxyHandler.prototype.verifyCSRF = function(token) {
  // TODO(taylor): Verify CSRF token is valid by checking against
  // aforementioned crypto secret.
  return token.indexOf(this.name) > 0;
};

ProxyHandler.prototype.generateCSRF = function() {
  // TODO(taylor): Create CSRF crypto secret based on name, then
  // generate a time-sensitive token here.
  return 'token:' + this.name;
};

module.exports = ProxyHandler;