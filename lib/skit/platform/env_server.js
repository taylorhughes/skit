'use strict';
'server-only';


var env = {};


module.exports = {
  get: function(key) {
    if (env[key]) {
      return env[key];
    }
    return null;
  },

  __setEnv__: function(requestEnv) {
    env = requestEnv;
  }
};
