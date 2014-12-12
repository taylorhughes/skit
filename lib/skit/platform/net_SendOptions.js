'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


/**
 * @class
 * @name SendOptions
 * @property {string=} method GET or POST, default GET.
 * @property {Object=} params Params to encode and include on the URL in a GET
 *     request, or in the POSTbody as a form-encoded string if a POST request.
 * @property {Object=} headers Headers to append to the request, eg.
 *     {'X-Foobar': 'The foobar you requested.'}.
 * @property {string=} body POSTbody to send. If params are also specified,
 *     there's no telling what will happen.
 * @property {SendOptions~callback=} success A callback to call when a request
 *     is successful. This is called on 200-coded results. If success is
 *     called, error will not be called.
 * @property {SendOptions~callback=} error A callback to call when a request
 *     is not successful. This is called on non-200 results. If error is
 *     called, success will not be called.
 * @property {SendOptions~callback=} complete A callback to call when a request
 *     is complete, regardless of responseCode.
 */
var SendOptions; // This exists purely for JSDoc.


/**
 * This callback is called as a result of requests made by send().
 * @callback SendOptions~callback
 * @param {Response} response The response from the server.
 */
var SendOptionsCallback;  // This exists purely for JSDoc.
