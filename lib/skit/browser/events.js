'use strict';
'browser-only';

/**
 * Add and remove event listeners on DOM elements.
 *
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


/** @ignore */
var Event = skit.browser.Event;
/** @ignore */
var iter = skit.platform.iter;
/** @ignore */
var ElementWrapper = skit.browser.ElementWrapper;


/** @ignore */
var boundHandlerId = 0;
/** @ignore */
var boundHandlers = {};
/** @ignore */
var globalListeners_ = [];


/**
 * Listen for a named DOM event on a given DOM node or {ElementWrapper}.
 *
 * @param {Element|ElementWrapper} maybeWrappedElement The DOM element or
 *     ElementWrapper to listen on.
 * @param {string} evtName The event name, eg. 'click'.
 * @param {Function} callback The callback function.
 * @param {Object=} opt_context The object that should be {this} inside
 *     the callback.
 * @return {number} The listener ID, which can be passed to unbind().
 */
module.exports.bind = function(maybeWrappedElement, evtName, callback, opt_context) {
  var element = maybeWrappedElement.element ? maybeWrappedElement.element : maybeWrappedElement;
  var wrappedCallback = function(evt) {
    var wrapped = new Event(evt);
    callback.call(opt_context, wrapped);
  };
  var listenerId = ++boundHandlerId + '';
  boundHandlers[listenerId] = {
    element: element,
    evtName: evtName,
    handler: wrappedCallback
  };

  if (element.addEventListener) {
    element.addEventListener(evtName, wrappedCallback);
  } else {
    element.attachEvent('on' + evtName, wrappedCallback);
  }

  if (element === window || element === document || element == document.body || element === document.documentElement) {
    globalListeners_.push(listenerId);
  }

  return listenerId;
};


/**
 * Unisten for an event given the listenerId returned by {bind}. Unattaches
 * the event listener from the original DOM element.
 *
 * @param {number} listenerId The listener ID returned by bind().
 */
module.exports.unbind = function(listenerId) {
  var wrapper = boundHandlers[listenerId];
  if (!wrapper) {
    return;
  }

  delete boundHandlers[listenerId];

  if (wrapper.element.addEventListener) {
    wrapper.element.removeEventListener(wrapper.evtName, wrapper.handler);
  } else {
    wrapper.element.detachEvent(wrapper.evtName, wrapper.handler);
  }
};


/**
 * Listen for an event on a matching child element from a parent element.
 *
 * @param {Element|ElementWrapper} maybeWrappedElement The DOM element or
 *     ElementWrapper to listen on.
 * @param {string} selector The selector used to determine {originalTarget}
 *     of the resulting {Event} object passed to {callback}.
 * @param {string} evtName The event name, eg. 'click'.
 * @param {Function} callback The callback function.
 * @param {Object=} opt_context The object that should be {this} inside
 *     the callback.
 * @return {number} The listener ID, which can be passed to unbind().
 */
module.exports.delegate = function(element, selector, evtName, callback, opt_context) {
  return module.exports.bind(element, evtName, function(evt) {
    var currentTarget = evt.target.up(selector);
    if (currentTarget) {
      evt.currentTarget = currentTarget;
      callback.apply(opt_context, arguments);
    }
  });
};


/**
 * Remove all listeners added to the global window/document/body.
 */
module.exports.removeGlobalListeners = function() {
  var listeners = globalListeners_;
  globalListeners_ = [];
  iter.forEach(listeners, function(listener) {
    module.exports.unbind(listener);
  });
};
