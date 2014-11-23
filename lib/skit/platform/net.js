'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var urls = skit.platform.urls;
var util = skit.platform.util;

var server = __module__.server;
var browser = __module__.browser;
var Response = __module__.Response;

var environment = server || browser;

return {
  send: function(url, opt_options) {
    var options = opt_options || {}; 

    var startTime = +(new Date());
    var method = (options.method || 'GET').toUpperCase();
    var body = options.body || '';
    var contentType = '';
    if (options.params) {
      if (method == 'GET') {
        url = urls.appendParams(url, options.params);
      } else if (options.params) {
        body = urls.toFormEncodedString(options.params);
        contentType = 'application/x-www-form-urlencoded';
      }
    }

    var headers = options.headers || {};
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    var sender = options.proxy || environment.send;
    sender(method, url, headers, body, function(status, headers, body) {
      // Don't log proxied requests because they'll get logged twice.
      if (!options.silent) {
        util.log('[skit.platform.net] ' + method + ' ' + url + ' - ' + status + ' - ' + (+(new Date()) - startTime) + 'ms');
      }

      var response = new Response(status, headers, body);

      if (response.status == 200) {
        if (options.success) {
          options.success.call(options.context, response);
        }
      } else {
        if (options.error) {
          options.error.call(options.context, response);
        }
      }

      if (options.complete) {
        options.complete.call(options.context, response);
      }
    });
  }
}
