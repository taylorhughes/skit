'use strict';

var reset = skit.browser.reset;
var Controller = skit.platform.Controller;
var urls = skit.platform.urls;
var util = skit.platform.util;


return Controller.create({
  __title__: function(childTitle) {
    return childTitle ? 'skit: ' + childTitle : 'skit';
  }
});