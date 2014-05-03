'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var util = skit.platform.util;


var PubSub = function() {
  this.listeners_ = [];
  this.listenersById_ = {};
  this.lastId_ = 0;
};


var shared_;
PubSub.sharedPubSub = function() {
  if (!shared_) {
    shared_ = new PubSub();
  }
  return shared_;
};


PubSub.prototype.subscribe = function(eventName, callback, opt_context) {
  if (!(eventName in this.listeners_)) {
    this.listeners_[eventName] = [];
  }

  var id = this.lastId_++;
  this.listeners_[eventName].push(id);
  this.listenersById_[id] = [callback, opt_context || null];

  return id;
};


PubSub.prototype.unsubscribe = function(subscriptionId) {
  delete this.listenersById_[subscriptionId];
};


PubSub.prototype.publish = function(eventName, var_args) {
  var args = Array.prototype.slice.call(arguments, 1);
  var listeners = this.listeners_[eventName] || [];

  var cleanedListeners = [];
  util.forEach(listeners, function(subscriptionId) {
    var listenerAndContext = this.listenersById_[subscriptionId];
    if (!listenerAndContext) {
      return;
    }

    var listener = listenerAndContext[0];
    var context = listenerAndContext[1];
    listener.apply(context, args);

    cleanedListeners.push(subscriptionId);
  }, this);
  this.listeners_[eventName] = cleanedListeners;
};


return PubSub;