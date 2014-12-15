'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

/** @ignore */
var iter = skit.platform.iter;


/**
 * A simple PubSub for publishing and subscribing to notifications by name.
 *
 * @class
 */
var PubSub = function() {
  this.listeners_ = [];
  this.listenersById_ = {};
  this.lastId_ = 0;
};


var shared_;


/**
 * @return {PubSub} A shared instance of PubSub for all to enjoy.
 */
PubSub.sharedPubSub = function() {
  if (!shared_) {
    shared_ = new PubSub();
  }
  return shared_;
};


/**
 * Subscribe for notifications for a given event name.
 *
 * @param {string} eventName The name of the event you want to be notified
 *     about.
 * @param {function} callback The callback function to call when the
 *     specified event happens.
 * @param {Object=} opt_context The context to call the callback function
 *     in when the event happens.
 * @return {number} A listener ID, which can later be used to unsubscibe.
 */
PubSub.prototype.subscribe = function(eventName, callback, opt_context) {
  if (!(eventName in this.listeners_)) {
    this.listeners_[eventName] = [];
  }

  var id = this.lastId_++;
  this.listeners_[eventName].push(id);
  this.listenersById_[id] = [callback, opt_context || null];

  return id;
};


/**
 * Unsubscribe for notifications we previously subscribed to.
 *
 * @param {number} subscriptionId The subscription ID returned by subscribe().
 */
PubSub.prototype.unsubscribe = function(subscriptionId) {
  delete this.listenersById_[subscriptionId];
};


/**
 * Publish an event by name. Listeners previously added by calling subscribe()
 * will be notified.
 *
 * @param {string} eventName The event name to notify subscribers about.
 * @param {...Object} var_args The arguments to pass to the subscriber callbacks.
 */
PubSub.prototype.publish = function(eventName, var_args) {
  var args = Array.prototype.slice.call(arguments, 1);
  var listeners = this.listeners_[eventName] || [];
  // In case this gets modified while we're iterating.
  this.listeners_[eventName] = [];

  var cleanedListeners = [];
  iter.forEach(listeners, function(subscriptionId) {
    var listenerAndContext = this.listenersById_[subscriptionId];
    if (!listenerAndContext) {
      return;
    }

    var listener = listenerAndContext[0];
    var context = listenerAndContext[1];
    listener.apply(context, args);

    cleanedListeners.push(subscriptionId);
  }, this);
  this.listeners_[eventName] = cleanedListeners.concat(this.listeners_[eventName]);
};


module.exports = PubSub;