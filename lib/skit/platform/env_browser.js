'use strict';
'browser-only';


module.exports = {
  get: function(key) {
    if (window.skit && window.skit.env && window.skit.env[key]) {
      return skit.env[key];
    }
    return null;
  }
};
