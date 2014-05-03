'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var server = __module__.server;
var browser = __module__.browser;

var net = server || browser;

return {
  send: function() {
    console.log('SENDING REQUEST:', arguments);
    net.send.apply(net, arguments);
  }
}
