'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var SkitServer = require('./SkitServer');
var optimizer = require('./optimizer');
var scriptresource = require('./loader/scriptresource');
var styleresource = require('./loader/styleresource');

module.exports = {
  'SkitServer': SkitServer,
  'optimizeServer': optimizer.optimizeServer,

  'styleresource': styleresource,
  'scriptresource': scriptresource,
};
