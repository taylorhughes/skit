'use strict';
'server-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var net = skit.platform.net;


function sendProxied(proxyObject, method, url, headers, body, onComplete) {
  var apiRequest = {method: method, url: url, headers: headers, body: body};
  proxyObject.modifyRequest(apiRequest);

  net.send(apiRequest.url, {
    method: apiRequest.method,
    body: apiRequest.body,
    headers: apiRequest.headers,
    complete: function(response) {
      proxyObject.modifyResponse(response);
      onComplete(response.status, response.headers, response.body);
    },
    silent: true
  });
}


return {
  sendProxied: sendProxied
};
