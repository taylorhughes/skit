'use strict';
'server-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

// Server-only code so we can hack it a bit and reach into local
// dependencies. I know, I feel dirty doing this too.
var request = require('request');

var __errorHandler__ = function(e) {
  throw e;
};

function send(method, url, headers, body, onComplete) {
  var handleResponse = function(err, nodeResponse, body) {
    var status = nodeResponse && nodeResponse.statusCode;
    var headers = nodeResponse && nodeResponse.headers;
    try {
      onComplete(status, headers, body);
    } catch(e) {
      __errorHandler__(e);
    }
  };

  var requestOptions = {method: method, url: url, body: body, headers: headers};
  request(requestOptions, handleResponse);
}


return {
  send: send,
  __setErrorHandler__: function(fn) {
    __errorHandler__ = fn;
  }
};
