'use strict';


var util = skit.platform.util;


return util.createClass({
  __init__: function(request) {
    this.request = request;
  },

  /**
   * Loads any necessary data from the backend API and handles any navigation
   * that should occur before render time.
   *
   * @param onLoaded {Function(Error, *)} A callback receiving an error
   *     or some data to send to __load__.
   */
  __preload__: function(onLoaded) {

  },

  /**
   * Receives data (possibly at a later time) that has been preloaded.
   *
   * @param var_args {...} The arguments passed from __preload__.
   */
  __load__: function(var_args) {

  },

  /**
   * Returns the HTML representing this piece of DOM.
   */
  __render__: function() {
    return '';
  },

  /**
   * Given a container, wires up the DOM rendered in __render__,
   * renders more content, handles any onload state, etc.
   *
   * @param container {Element} The container element where the content
   *     rendered in __render__() has been plaed.
   */
  __ready__: function(container) {

  },

  /**
   * Cleans up any event listeners, etc. that should be cleaned up before
   * we navigate away.
   */
   __unload__: function() {
    
   }
});