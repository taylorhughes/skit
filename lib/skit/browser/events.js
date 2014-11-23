'use strict';
'browser-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


var Event = skit.browser.Event;
var util = skit.platform.util;
var ElementWrapper = skit.browser.ElementWrapper;


var module = {};

var boundHandlerId = 0;
var boundHandlers = {};
var globalListeners_ = [];


module.bind = function(maybeWrappedElement, evtName, callback, opt_context) {
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


module.unbind = function(listenerId) {
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


module.delegate = function(element, selector, evtName, callback, opt_context) {
  return module.bind(element, evtName, function(evt) {
    var currentTarget = evt.target.up(selector);
    if (currentTarget) {
      evt.currentTarget = currentTarget;
      callback.apply(opt_context, arguments);
    }
  });
};


module.removeGlobalListeners = function() {
  var listeners = globalListeners_;
  globalListeners_ = [];
  util.forEach(listeners, function(listener) {
    module.unbind(listener);
  });
};


return module;
