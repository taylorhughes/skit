'use strict';
'browser-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var net = skit.platform.net;
var urls = skit.platform.urls;


function sendProxied(proxyObject, method, url, headers, body, onComplete) {
  net.send('/__proxy__/' + proxyObject.name, {
    method: 'POST',
    params: {
      url: url,
      method: method,
      headers: urls.toFormEncodedString(headers || {}),
      body: body,
      csrfToken: proxyObject.csrfToken
    },
    complete: function(response) {
      // unpack the response from the proxy endpoint, if it exists.
      var parsed = response.body || {};
      var status = parsed['status'] || -1;
      var headers = parsed['headers'] || {};
      var body = parsed['body'] || '';

      onComplete(status, headers, body);
    },
    silent: true
  });
}


return {
  sendProxied: sendProxied
}