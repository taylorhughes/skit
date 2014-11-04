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
    return element.clientWidth || element.outerWidth;
  },


  height: function(element) {
    element = element.element || element;
    if (element === window) {
      return document.documentElement.clientHeight || window.innerHeight;
    }
    return element.clientHeight || element.outerHeight;
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
