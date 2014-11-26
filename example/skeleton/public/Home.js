'use strict';

var Controller = skit.platform.Controller;
var net = skit.platform.net;

// This is the base controller located in our "library" module.
var BaseController = library.BaseController;

// This loads Home.html so we can render the main content for the page.
var html = __module__.html;


// Specifying BaseController here makes BaseController the parent Controller:
// It modify our body HTML, title, etc. See that module for more information.
return Controller.create(BaseController, {
  __preload__: function(onLoaded) {
    // This is where you load any data necessary for the initial page render.
    // net.send() works from the client and server, exactly the same way.

    var items = [];
    net.send('https://cluster-static.s3.amazonaws.com/skit/example.json', {
      success: function(response) {
        items = response.body['items'];
      },
      error: function() {
        items = [{title: 'Oops!', description: 'Could not load the example data.'}];
      },
      complete: function() {
        onLoaded(items);
      }
    })
  },

  __load__: function(items) {
    // This is called on the server and client in order to setup the Controller
    // object with the preloaded data.
    this.items = items;
  },

  __title__: function() {
    return 'Home';
  },

  __body__: function() {
    return html({
      items: this.items
    });
  },

  __ready__: function(container) {
    // This is where the client lifecycle begins; we hook up event listeners,
    // format things in the browser if necessary, etc.

    // var $link = dom.get('a.foo');
    // events.bind($link, 'click', this.onClickLink, this);
  }
});