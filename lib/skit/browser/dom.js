'use strict';
'browser-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var ElementWrapper = skit.browser.ElementWrapper;
var util = skit.platform.util;
var zest = skit.thirdparty.zest;

var module = {};


module.find = function(selector) {
  return util.map(zest(selector), function(el) {
    return new ElementWrapper(el);
  });
};


module.$ = module.find;


module.get = function(selector) {
  return module.find(selector)[0];
};


module.gel = function(id) {
  return module.find('#' + id)[0];
};


return module;