var Controller = skit.platform.Controller;
var string = skit.platform.string;
var navigation = skit.platform.navigation;
var BaseController = library.BaseController;
var GitHubAPIClient = library.GitHubAPIClient;
var template = __module__.html;
module.exports = Controller.create(BaseController, {
  __preload__: function(loaded) {
    var query = navigation.query();
    GitHubAPIClient.loadGist(query['id'], function(gist) {
      if (!gist) {
        navigation.notFound();
      } else {
        this.gist = gist;
      }

      loaded();
    }, this);
  },
  __title__: function() {
    return 'Gist by ' + string.escapeHtml(this.gistOwner());
  },
  __body__: function() {
    return template({gist: this.gist, gistOwner: this.gistOwner()});
  },
  gistOwner: function() {
    if (this.gist['owner']) {
      return this.gist['owner']['login'];
    }
    return 'anonymous';
  }
});