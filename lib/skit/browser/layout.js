'use strict';
'browser-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


return {
  width: function(element) {
    element = element.element || element;
    if (element === window) {
      return document.documentElement.clientWidth || window.innerWidth;
    }
    if (typeof element.clientWidth !== 'undefined') {
      return element.clientWidth;
    }
    return element.outerWidth;
  },


  height: function(element) {
    element = element.element || element;
    if (element === window) {
      return document.documentElement.clientHeight || window.innerHeight;
    }
    if (typeof element.clientHeight !== 'undefined') {
      return element.clientHeight;
    }
    return element.outerHeight;
  },


  offsetParent: function(element) {
    element = element.element || element;
    return element.offsetParent || document.body;
  },


  position: function(element) {
    element = element.element || element;
    var p = {left: element.offsetLeft || 0, top: element.offsetTop || 0};
    while (element = element.offsetParent) {
        p.left += element.offsetLeft;
        p.top += element.offsetTop;
    }
    return p;
  }
};
