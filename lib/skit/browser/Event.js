'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */



var Event = function() {
  this.target = null;
  // mouseX, mouseY, keyCode, etc.
};


Event.prototype.stopPropagation = function() {

};


Event.prototype.preventDefault = function() {

};


return Event;
