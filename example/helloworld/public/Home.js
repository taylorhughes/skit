var dom = skit.browser.dom;
var events = skit.browser.events;
var Controller = skit.platform.Controller;
// Add GitHubAPIClient for loading GitHub content.
var GitHubAPIClient = library.GitHubAPIClient;
var template = __module__.html;
module.exports = Controller.create({
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