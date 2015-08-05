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
function scrollTop(element) {
  if (isGlobal(element)) {
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  return element.scrollTop;
}
module.exports.scrollTop = scrollTop;


/**
 * @param {Element|ElementWrapper|Window|Document} A DOM element.
 * @return {number} The "scrollLeft" value for the given element, ie. how far
 *     the given element is scrolled. If window, document or body is passed,
 *     use the browser-appropriate scrollLeft measure.
 */
function scrollLeft(element) {
  if (isGlobal(element)) {
    return window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  }

  return element.scrollLeft;
}
module.exports.scrollLeft = scrollLeft;


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
 * @param {Element|ElementWrapper} A DOM element.
 * @return {Element} The offset parent for this element, which is the first
 *     ancestor element that is not statically positioned.
 */
module.exports.offsetParent = function(element) {
  element = element.element || element;
  return element.offsetParent || element.ownerDocument.body;
};


/**
 * @param {Element|ElementWrapper} A DOM element.
 * @return {{left: number, top: number, width: number, height: number}} The
 *     current position, width and height of the given element. If the element
 *     is hidden, returns all zeroes.
 */
function boundingRect(element) {
  element = element.element || element;

  var rect = null;
  if (element.getClientRects().length) {
    rect = element.getBoundingClientRect();
  }

  if (!(rect && (rect.width || rect.height))) {
    return {top: 0, left: 0, width: 0, height: 0};
  }

  var document = element.ownerDocument;
  var window = document.defaultView;
  var documentElement = document.documentElement;

  return {
    top: rect.top + window.pageYOffset - documentElement.clientTop,
    left: rect.left + window.pageXOffset - documentElement.clientLeft,
    height: rect.height,
    width: rect.width
  };
}
module.exports.boundingRect = boundingRect;


/**
 * @param {Element|ElementWrapper} A DOM element.
 * @return {{left: number, top: number}} The current position of the given element.
 */
module.exports.position = function(element) {
  var rect = boundingRect(element);
  return {top: rect.top, left: rect.left};
};


/**
 * @param {Element|ElementWrapper|Window|Document} A DOM element.
 * @return {number} The outer width of the given element, which includes
 *     padding and borders.
 */
module.exports.width = function(element) {
  element = element.element || element;
  if (isGlobal(element)) {
    return document.documentElement.clientWidth || window.innerWidth;
  }
  return boundingRect(element).width;
};


/**
 * @param {Element|ElementWrapper|Window|Document} A DOM element.
 * @return {number} The outer height of the given element, which includes
 *     padding and borders.
 */
module.exports.height = function(element) {
  element = element.element || element;
  if (isGlobal(element)) {
    return document.documentElement.clientHeight || window.innerHeight;
  }
  return boundingRect(element).height;
};
