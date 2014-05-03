'use strict';
'browser-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var json = skit.platform.json;
var urls = skit.platform.urls;
var util = skit.platform.util;

var Response = __module__.Response;



function createXHR() {
  var xhr;
  if (window.ActiveXObject) {
    try {
      xhr = new ActiveXObject('Microsoft.XMLHTTP');
    } catch(e) {
      xhr = null;
    }
  } else {
    xhr = new XMLHttpRequest();
  }

  return xhr;
}


function send(url, opt_options) {
  var options = opt_options || {};
  var method = (options.method || 'GET').toUpperCase();

  var xhr = createXHR();
  xhr.onreadystatechange = function() {
    if (xhr.readyState != 4) {
      return;
    }

    var status = xhr.status;
    var headersText = xhr.getAllResponseHeaders();
    var headers = {};

    util.forEach(headersText.split(/[\n\r]+/), function(line) {
      var result = /^([\w-]+):\s*(.+)$/.exec(line);
      if (result) {
        headers[result[1]] = result[2];
      }
    });

    var body = xhr.responseText;
    var response = new Response(status, body, headers);

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
  xhr.open(method, url, true);

  var contentType = options.contentType;
  var body = null;
  if (method == 'POST') {
    if (options.params) {
      body = urls.toFormEncodedString(params);
      if (!contentType) {
        contentType = 'application/x-www-form-urlencoded';
      }
    }
  } else {
    if (options.params) {
      url = urls.appendParams(url, options.params);
    }
  }
  xhr.setRequestHeader('Content-Type', contentType);
  xhr.send();
}


return {
  send: send
};