'use strict';

var Controller = skit.platform.Controller;

var BaseController = library.BaseController;

var html = __module__.html;


return Controller.create(BaseController, {
  __title__: function() {
    return 'Getting Started';
  },

  __body__: function() {
    return html();
  }
});