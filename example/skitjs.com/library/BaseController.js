'use strict';

var reset = skit.browser.reset;
var Controller = skit.platform.Controller;
var urls = skit.platform.urls;
var util = skit.platform.util;

// This loads Base.html from this directory.
var html = __module__.html;


var TABS = [
  {name: 'Overview', url: '/'},
  {name: 'How It Works', url: '/how-it-works'},
  {name: 'Download', url: '/download'}
];


return Controller.create({
  __title__: function(childTitle) {
    return childTitle ? 'skit: ' + childTitle : 'skit';
  },

  __body__: function(childHtml) {
    var path = urls.parse(this.request.url).path;
    var tabs = util.map(TABS, function(tab) {
      tab = util.copy(tab);
      if (tab.url == path) {
        tab.selected = true;
      }
      return tab;
    });

    return html({
      childHtml: childHtml,
      tabs: tabs
    });
  }
});