'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var json = skit.platform.json;
var util = skit.platform.util;


function headerName(string) {
  return util.map(string.split('-'), util.capitalize).join('-');
}


function Response(statusCode, headers, bodyText) {
  this.status = statusCode;
  this.headers = {};
  for (var key in headers) {
    this.headers[headerName(key)] = headers[key];
  }

  var contentType = this.headers['Content-Type'] || '';
  if (contentType.indexOf('/json') > 0) {
    this.body = json.parse(bodyText);
  } else {
    this.body = bodyText;
  }
}


return Response;