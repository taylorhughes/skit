'use strict';

var reset = skit.browser.reset;
var Controller = skit.platform.Controller;

// This loads Base.html from this directory.
var html = __module__.html;


return Controller.create({
  __title__: function(childTitle) {
    // Parent controllers can frame the title content of child controllers.
    return childTitle + ' | Skit';
  },

  __body__: function(childHtml) {
    // Parent controllers can frame the body content of child controllers.
    return html({
      childHtml: childHtml
    });
  }
});