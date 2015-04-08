'use strict';

var reset = skit.browser.reset;
var Controller = skit.platform.Controller;
var urls = skit.platform.urls;
var util = skit.platform.util;


return Controller.create({
  __title__: function(childTitle) {
    return childTitle ? 'skit: ' + childTitle : 'skit';
  },

  __ready__: function() {
    setTimeout(function() {
      var parsed = urls.parse(window.location.href);
      if (parsed.port && parsed.port != 80 && parsed.port != 443) {
        return;
      }

      var GA_TRACKING_ID = 'UA-61684202-1';

      var _gaq = window._gaq = window._gaq || [];
      _gaq.push(['_setAccount', GA_TRACKING_ID]);
      _gaq.push(['_trackPageview']);

      var ga = document.createElement('script');
      ga.type = 'text/javascript';
      ga.async = true;
      ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
      document.getElementsByTagName('head')[0].appendChild(ga);
    }, 100);
  }
});