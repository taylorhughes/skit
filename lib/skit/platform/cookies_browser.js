'use strict';
'browser-only';

/**
 * @module
 * @ignore
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var cookies = skit.thirdparty.cookies;


module.exports = {
  get: cookies.get,
  set: cookies.set
};
