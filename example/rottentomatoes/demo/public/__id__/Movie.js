
// "skit" is globally available and has some useful things in it.
var Controller = skit.platform.Controller;
var navigation = skit.platform.navigation;
var net = skit.platform.net;
var netproxy = skit.platform.netproxy;

var BaseController = library.BaseController;
var template = __module__.html;

return Controller.create(BaseController, {
  // Load some shit to render from a remove server.
  __preload__: function(onLoaded) {
    var movie = null;

    // We can get arguments out of the URL like so.
    var id = this.request.params['__id__'];
    id = parseInt(id.split('-').slice(-1)[0], 10);

    net.send('movies/' + id + '.json', {
      proxy: netproxy.getProxyNamed('rottentomatoes'),
      success: function(response) {
        movie = response.body;
      },
      complete: function() {
        if (!movie) {
          navigation.notFound();
        }
        onLoaded(movie);
      }
    });
  },

  __load__: function(movie) {
    this.movie = movie;
  },

  __title__: function() {
    return this.movie['title'];
  },

  __body__: function() {
    return template(this.movie);
  }
});
