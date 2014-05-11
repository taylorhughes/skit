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


function send(method, url, headers, body, onComplete) {
  var handleResponse = function(err, nodeResponse, body) {
    var status = nodeResponse && nodeResponse.statusCode;
    var headers = nodeResponse && nodeResponse.headers;
    onComplete(status, headers, body);
  };

  var requestOptions = {url: url, body: body, headers: headers};
  if (method == 'POST') {
    request.post(requestOptions, handleResponse);
  } else {
    request.get(requestOptions, handleResponse);
  }
}


return {
  send: send
};
