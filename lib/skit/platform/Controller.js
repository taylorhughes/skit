'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */



var util = skit.platform.util;


var Controller = util.createClass({
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
    onLoaded();
  },

  /**
   * Receives data (possibly at a later time) that has been preloaded.
   *
   * @param var_args {...} The arguments passed from __preload__.
   */
  __load__: function(var_args) {

  },

  /**
   * Returns the title for this page.
   */
  __title__: function() {
    return '';
  },

  /**
   * Returns the HTML representing this piece of DOM.
   */
  __meta__: function() {
    return '';
  },

  /**
   * Returns the HTML representing this piece of DOM.
   */
  __body__: function() {
    return '';
  },

  /**
   * Given a container, wires up the DOM rendered in __render__,
   * renders more content, handles any onload state, etc.
   *
   * @param container {Element} The container element where the content
   *     rendered in __body__() has been plaed.
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

Controller.create = function(var_args) {
  var args = Array.prototype.slice.apply(arguments);
  var object, parent;
  if (args.length == 2) {
    parent = args[0];
    object = args[1];
  } else {
    object = args[0];
  }

  var klass = util.createClass(Controller, object);
  klass.__controller__ = true;

  if (parent) {
    klass.__parent__ = parent;
  }
  return klass;
};


return Controller;
