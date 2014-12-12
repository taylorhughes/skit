'use strict';
'browser-only';

/**
 * @module
 * @ignore
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var iter = skit.platform.iter;


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


function send(method, url, headers, body, onComplete) {
  var xhr = createXHR();
  xhr.onreadystatechange = function() {
    if (xhr.readyState != 4) {
      return;
    }

    var headersText = xhr.getAllResponseHeaders();
    var headers = {};

    iter.forEach(headersText.split(/[\n\r]+/), function(line) {
      var result = /^([\w-]+):\s*(.+)$/.exec(line);
      if (result) {
        headers[result[1]] = result[2];
      }
    });

    onComplete(xhr.status, headers, xhr.responseText);
  };

  xhr.open(method, url, true);
  for (var key in headers) {
    xhr.setRequestHeader(key, headers[key]);
  }
  xhr.send(body);
}


module.exports = {
  send: send
};