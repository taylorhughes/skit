'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var ElementWrapper = skit.browser.ElementWrapper;


var module = {};


module.$ = function(el) {
  return new ElementWrapper(el);
};


return module;