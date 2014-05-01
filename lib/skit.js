
var http = require('http');
var loader = require('./loader/loader');


function run(packagePath, opt_port) {
  var port = opt_port || 3001;
  var server = http.createServer(function(req, res) {
    var tree = loader.load(packagePath);
    var public = tree.getChildWithName('public');
    if (!public) {
      throw new Exception('Improperly configured');
    }

    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});

    // Remove the leading slash.
    var url = req.url.substring(1);
    var parts = url.split('?');
    var path = parts[0];
    var query = parts[1];

    var pathComponents = path.split('/').filter(function(piece) { return !!piece; });
    var module = public.findNodeWithPath(pathComponents);

    if (module) {
      var leaves = module.children();
      var leaf = leaves[0];
      leaf.getMainObject(function(err, klass, loaded) {
        if (err) {
          res.end(JSON.stringify({error: err + ''}));
        } else if (!klass) {
          res.end(JSON.stringify({error: 'Controller not found here.'}));
        } else {
          var controller = new klass();
          var result = controller.toJSON();
          result['__loaded__'] = loaded.slice(0, 5);
          res.end(JSON.stringify(result));
        }
      });
    } else {
      res.end(JSON.stringify('Not Found'));
    }
  });
  server.listen(port);

  console.log('Skit started on localhost:' + port);
}


module.exports = {
  'run': run
};
