'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var ElementWrapper = skit.browser.ElementWrapper;


var Event = function(evt) {
  this.evt_ = evt;

  this.target = new ElementWrapper(evt.srcElement || evt.target);
  this.currentTarget = null;

  this.type = evt.type;

  // mouseX, mouseY, keyCode, etc.
};


Event.prototype.stopPropagation = function() {
  if (this.evt_.stopPropagation) {
    this.evt_.stopPropagation();
  } else {
    this.evt_.cancelBubble = true;
  }
};


Event.prototype.preventDefault = function() {
  if (this.evt_.preventDefault) {
    this.evt_.preventDefault();
  } else {
    this.evt_.returnValue = false;
  }
};


return Event;
