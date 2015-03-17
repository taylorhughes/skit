'use strict';
'browser-only';

/**
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


/** @ignore */
function isGlobal(element) {
  return (element === window || element === document || element === document.body);
}


/**
 * @param {Element|ElementWrapper|Window|Document} A DOM element.
 * @return {number} The "scrollTop" value for the given element, ie. how far
 *     the given element is scrolled. If window, document or body is passed,
 *     use the browser-appropriate scrollTop measure.
 */
module.exports.scrollTop = function(element) {
  if (isGlobal(element)) {
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  return element.scrollTop;
};


/**
 * @param {Element|ElementWrapper|Window|Document} A DOM element.
 * @return {number} The "scrollHeight" value for the given element, ie. how
 *     tall the element is if it had no scroll bar. If window, document or
 *     body is passed, use the browser-appropriate scrollHeight measure.
 */
module.exports.scrollHeight = function(element) {
  if (isGlobal(element)) {
    if (typeof document.body.scrollHeight !== 'number') {
      return document.documentElement.scrollHeight;
    }
    return document.body.scrollHeight;
  }

  return element.scrollHeight;
};


/**
 * @param {Element|ElementWrapper|Window|Document} A DOM element.
 * @return {number} The outer width of the given element, which includes
 *     padding and borders.
 */
module.exports.width = function(element) {
  element = element.element || element;
  if (element === window) {
    return document.documentElement.clientWidth || window.innerWidth;
  }
  if (typeof element.offsetWidth !== 'undefined') {
    return element.offsetWidth;
  }
  return element.outerWidth;
};


/**
 * @param {Element|ElementWrapper|Window|Document} A DOM element.
 * @return {number} The outer height of the given element, which includes
 *     padding and borders.
 */
module.exports.height = function(element) {
  element = element.element || element;
  if (element === window) {
    return document.documentElement.clientHeight || window.innerHeight;
  }
  if (typeof element.offsetHeight !== 'undefined') {
    return element.offsetHeight;
  }
  return element.outerHeight;
};


/**
 * @param {Element|ElementWrapper} A DOM element.
 * @return {Element} The offset parent for this element, which is the first
 *     ancestor element that is not statically positioned.
 */
module.exports.offsetParent = function(element) {
  element = element.element || element;
  return element.offsetParent || document.body;
};


/**
 * @param {Element|ElementWrapper} A DOM element.
 * @return {{left: number, top: number}} The current position of the given element.
 */
module.exports.position = function(element) {
  element = element.element || element;
  var p = {left: element.offsetLeft || 0, top: element.offsetTop || 0};
  while (element = element.offsetParent) {
      p.left += element.offsetLeft;
      p.top += element.offsetTop;
  }
  return p;
};
