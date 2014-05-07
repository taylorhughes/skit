'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var util = skit.platform.util;


var ElementWrapper = function(el) {
  this.el = el;
};


ElementWrapper.prototype.children = function() {

};


ElementWrapper.prototype.parent = function() {

};


ElementWrapper.prototype.matches = function() {
  // whether this element matches a given selector
};


ElementWrapper.prototype.find = function(selector) {

};


ElementWrapper.prototype.$ = ElementWrapper.prototype.find;


ElementWrapper.prototype.first = function(selector) {

};


ElementWrapper.prototype.up = function(selector) {

};


ElementWrapper.prototype.remove = function() {

};


ElementWrapper.prototype.hasClass = function() {

};


ElementWrapper.prototype.addClass = function() {

};


ElementWrapper.prototype.removeClass = function() {

};


ElementWrapper.prototype.toggleClass = function() {

};


ElementWrapper.prototype.getData = function(key) {
  if (this.el.dataset) {
    return this.el.dataset[util.camelCase(key)];
  }
  return this.el.getAttribute('data-' + key);
};


ElementWrapper.prototype.setData = function(key, value) {
  if (this.el.dataset) {
    return this.el.dataset[util.camelCase(key)] = value;
  }
  return this.el.setAttribute('data-' + key, value);
};


ElementWrapper.prototype.setText = function(value) {
  if (typeof this.el.innerText !== 'undefined') {
    this.el.innerText = value;
  } else {
    this.el.innerHTML = util.escapeHtml(value);
  }
};


ElementWrapper.prototype.getValue = function() {

};


return ElementWrapper;
