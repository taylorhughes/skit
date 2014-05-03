'use strict';
'server-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var urls = skit.platform.urls;

var Response = __module__.Response;

// Server-only code so we can hack it a bit and reach into local dependencies.
var request = require('request');


function send(url, opt_options) {
  var options = opt_options || {};
  var method = (options.method || 'GET').toUpperCase();

  var handleResponse = function(err, nodeResponse, body) {
    var status = nodeResponse.statusCode;
    var response = new Response(status, body, nodeResponse.headers);

    if (status == 200) {
      if (options.success) {
        options.success(response);
      }
    } else {
      if (options.error) {
        options.error(response);
      }
    }

    if (options.complete) {
      options.complete(response);
    }
  };

  if (method == 'POST') {
    var requestOptions = {url: url};
    if (options.params) {
      requestOptions['form'] = options.params;
    }
    request.post(requestOptions, handleResponse);
  } else {
    if (options.params) {
      url = urls.appendParams(url, options.params);
    }
    request.get(url, handleResponse);
  }
}


return {
  send: send
};
