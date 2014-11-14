'use strict';
'browser-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var ElementWrapper = skit.browser.ElementWrapper;


var Event = function(evt) {
  this.originalEvent = evt;

  this.target = new ElementWrapper(evt.srcElement || evt.target);
  this.currentTarget = null;

  this.type = evt.type;

  this.keyCode = evt.keyCode || null;
  this.shiftKey = evt.shiftKey || false;

  var posX = 0;
  var posY = 0;
  if (evt.pageX || evt.pageY)   {
    posX = evt.pageX;
    posY = evt.pageY;
  } else if (evt.clientX || evt.clientY)  {
    posX = evt.clientX + document.body.scrollLeft
      + document.documentElement.scrollLeft;
    posY = evt.clientY + document.body.scrollTop
      + document.documentElement.scrollTop;
  }

  this.pageX = posX;
  this.pageY = posY;
};


Event.prototype.stopPropagation = function() {
  if (this.originalEvent.stopPropagation) {
    this.originalEvent.stopPropagation();
  } else {
    this.originalEvent.cancelBubble = true;
  }
};


Event.prototype.preventDefault = function() {
  if (this.originalEvent.preventDefault) {
    this.originalEvent.preventDefault();
  } else {
    this.originalEvent.returnValue = false;
  }
};


return Event;
