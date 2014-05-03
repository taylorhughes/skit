'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var util = skit.platform.util;

var server = __module__.server;
var browser = __module__.browser;

var net = server || browser;

return {
  send: function() {
    var method = (arguments[1] && arguments[1].method) || 'GET';
    util.log('Sending request:', method, arguments[0]);
    net.send.apply(net, arguments);
  }
}
