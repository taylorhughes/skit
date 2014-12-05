

var path = require('path');

try {
  var skit = require('../../../skit');
} catch (e) {
  var skit = require('skit');
}

// "demo" here refers to the root of the skit module tree
// this thing is going to build and serve modules from.
// "debug" forces the server to reload our modules with
// every request, which makes development easier.
var server = new skit.SkitServer(path.join(__dirname, 'demo'), {debug: true});

server.registerProxy('rottentomatoes',
  function(proxyRequest, apiRequest) {
    var API_PATH = 'http://api.rottentomatoes.com/api/public/v1.0/';
    apiRequest.url = API_PATH + apiRequest.url;
    if (apiRequest.url.indexOf('?') < 0) {
      apiRequest.url += '?';
    }
    // Secret API key never leaves the server.
    apiRequest.url += '&apikey=b6pr5tn4s5342z5dz4qfkz67';
  },
  function(apiRequest, apiResponse, proxyResponse) {
    // pass
  });

// Set up our detail page path. Any directory in our "public" tree
// named __id__ will match this regular expression. And in those
// controllers, this.request.params['__id__'] will be set to the
// matching path component.
server.registerUrlArgument('__id__', /\w+(-\w+)*-\d+/);

var port = 3002;
server.listen(port);

console.log('Listening on 0.0.0.0:' + port);
