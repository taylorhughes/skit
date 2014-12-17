
var dom = skit.browser.dom;
var events = skit.browser.events;
var Controller = skit.platform.Controller;

var BaseController = library.BaseController;
var GitHubAPIClient = library.GitHubAPIClient;

var template = __module__.html;

module.exports = Controller.create(BaseController, {
  __preload__: function(loaded) {
    GitHubAPIClient.loadGists(function(gists) {
      this.gists = gists;
      loaded();
    }, this);
  },

  __title__: function() {
    return 'Home';
  },

  __body__: function() {
    return template({gists: this.gists});
  },

  __ready__: function() {
    var reload = dom.get('#reload');
    events.bind(reload, 'click', this.reload, this);
  }
});