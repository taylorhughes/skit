
var net = skit.platform.net;

var GITHUB_BASE_URL = 'https://api.github.com/gists/';

var logError = function(response) {
  console.log('Error loading:', response.code,
      'body:', response.body);
};

module.exports = {
  loadGists: function(apiCallback, context) {
    var gists = [];
    var done = function() {
      apiCallback.call(context, gists);
    };
    net.send(GITHUB_BASE_URL + 'public', {
      success: function(response) {
        gists = response.body;
      },
      error: logError,
      complete: done
    });
  },

  loadGist: function(gistId, apiCallback, context) {
    var gist = null;
    var done = function() {
      apiCallback.call(context, gist);
    };
    net.send(GITHUB_BASE_URL + encodeURIComponent(gistId), {
      success: function(response) {
        gist = response.body;
      },
      error: logError,
      complete: done
    })
  }
};