'use strict';

var Controller = skit.platform.Controller;

var BaseController = library.BaseController;

// This loads About.html from this directory.
var html = __module__.html;


return Controller.create(BaseController, {
  // This controller doesn't preload anything.
  __title__: function() {
    return 'About';
  },

  __body__: function() {
    return html();
  }
});