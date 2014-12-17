'use strict';

/**
 * @class
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

/** @ignore */
var json = skit.platform.json;
/** @ignore */
var iter = skit.platform.iter;
/** @ignore */
var string = skit.platform.string;


function headerName(str) {
  return iter.map(str.split('-'), string.capitalize).join('-');
}


/**
 * A response from the net.send() function, passed to all callbacks.
 *
 * @param {number} statusCode The status code.
 * @param {Object} headers The response headers.
 * @param {string} bodyText The body text.
 * @constructor
 */
function Response(statusCode, headers, bodyText) {
  this.status = statusCode;
  this.headers = {};
  for (var key in headers) {
    this.headers[headerName(key)] = headers[key];
  }

  var contentType = this.headers['Content-Type'] || '';
  // Various public APIs return JSON stuff as all kinds of things.
  var isMaybeJSON = contentType.indexOf('/json') > -1 ||
                    contentType.indexOf('/javascript') > -1 ||
                    contentType.indexOf('/x-javascript') > -1;

  this.bodyText = bodyText;
  this.body = bodyText;

  if (isMaybeJSON && typeof bodyText === 'string') {
    try {
      this.body = json.parse(bodyText);
    } catch (e) {}
  }
};


/**
 * @property {number} The response status, eg. 200.
 */
Response.prototype.status;


/**
 * @property {Object} The response body. If the response's content-type
 * indicates that this is probably JSON, this property will be an Object.
 * Otherwise it will be a string.
 */
Response.prototype.body;


/**
 * @property {string} The response body. Regardless of {body}, this will
 * be a raw string.
 */
Response.prototype.bodyText;


/**
 * @property {Object} The response headers,
 * eg. {'Content-Type': 'application/json'}. Header names are guaranteed to
 * be capitalized in the form 'Content-Type'.
 */
Response.prototype.headers;


module.exports = Response;