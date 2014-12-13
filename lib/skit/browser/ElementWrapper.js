'use strict';
'browser-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

/** @ignore */
var iter = skit.platform.iter;
/** @ignore */
var string = skit.platform.string;
/** @ignore */
var zest = skit.thirdparty.zest;


/** @ignore */
var ELEMENT_NODE_TYPE = 1;


/**
 * A DOM manipulation helper that wraps a single DOM element.
 *
 * @param {Element} element The element to perform operations on.
 * @constructor
 */
var ElementWrapper = function(element) {
  this.element = element;
};


/**
 * For a given HTML string, generate DOM nodes and wrap them with
 * ElementWrappers, returning the result array.
 *
 * @param {string} html The HTML to parse into an ElementWrapper.
 * @return {Array} The wrapped DOM elements from the given HTML.
 */
ElementWrapper.elementsFromHtml = function(html) {
  var div = document.createElement('div');
  div.innerHTML = html;
  return iter.map((new ElementWrapper(div)).children(), function($child) {
    $child.remove();
    return $child;
  });
};


/**
 * For a given HTML string, generate a single DOM node and wrap it with
 * an ElementWrapper, returning the result.
 *
 * @param {string} html The HTML to parse into an ElementWrapper.
 * @return {Array} The wrapped DOM element from the given HTML.
 */
ElementWrapper.fromHtml = function(html) {
  return ElementWrapper.elementsFromHtml(html)[0];
};


/**
 * @return {Array} The {ElementWrapper}-wrapped children of this element.
 */
ElementWrapper.prototype.children = function() {
  var filtered;
  if (this.element.children) {
    filtered = iter.toArray(this.element.children);
  } else {
    filtered = iter.filter(this.element.childNodes, function(node) {
      return node.nodeType == ELEMENT_NODE_TYPE;
    });
  }

  return iter.map(filtered, function(element) {
    return new ElementWrapper(element);
  });
};


/**
 * @param {Element|ElementWrapper} otherEl The other element, which is possibly
 *     a child of this element.
 * @return {boolean} Whether {otherEl} is a child of this element.
 */
ElementWrapper.prototype.contains = function(otherEl) {
  var current = otherEl.element || otherEl;
  while (current) {
    if (current == this.element) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
};


/**
 * @return {ElementWrapper} The {ElementWrapper}-wrapped parent of this element.
 */
ElementWrapper.prototype.parent = function() {
  if (this.element.parentNode && this.element.parentNode.nodeType == ELEMENT_NODE_TYPE) {
    return new ElementWrapper(this.element.parentNode);
  }
  return null;
};


/**
 * @param {string} selector A CSS selector.
 * @return {boolean} Whether this element matches the given selector.
 */
ElementWrapper.prototype.matches = function(selector) {
  return zest.matches(this.element, selector);
};


/**
 * @param {string} selector A CSS selector.
 * @return {Array} An array of ElementWrapper-wrapped descendants of this
 *     element that match the provided selector.
 */
ElementWrapper.prototype.find = function(selector) {
  return iter.map(zest(selector, this.element), function(el) {
    return new ElementWrapper(el);
  });
};


/**
 * @param {string} selector A CSS selector.
 * @return {ElementWrapper} The first ElementWrapper-wrapped descendant of this
 *     element that matches the provided selector.
 */
ElementWrapper.prototype.get = function(selector) {
  var found = this.find(selector);
  return found.length ? found[0] : null;
};


/**
 * @return {ElementWrapper?} The first ElementWrapper-wrapped child of this
 *     element, or null if it has none.
 */
ElementWrapper.prototype.first = function() {
  var children = this.children();
  return children.length ? children[0] : null;
};


/**
 * @param {string} selector A CSS selector.
 * @return {ElementWrapper?} The first ElementWrapper-wrapped ancestor of this
 *     element that matches a given selector.
 */
ElementWrapper.prototype.up = function(selector) {
  var current = this;
  while (current && !current.matches(selector)) {
    current = current.parent();
  }
  return current;
};


/**
 * Removes this element from its parent.
 */
ElementWrapper.prototype.remove = function() {
  if (this.element.parentNode) {
    this.element.parentNode.removeChild(this.element);
  }
};


/**
 * Replace the current node with the given node or HTML fragment.
 *
 * @param {string|Element|ElementWrapper} htmlOrElement The fragment to replace
 *     the current element with.
 */
ElementWrapper.prototype.replaceWith = function(htmlOrElement) {
  var replacement;
  if (typeof htmlOrElement == 'string') {
    replacement = ElementWrapper.fromHtml(htmlOrElement).element;
  } else {
    replacement = htmlOrElement.element || htmlOrElement;
  }

  if (this.element.parentNode) {
    this.element.parentNode.insertBefore(replacement, this.element);
    this.element.parentNode.removeChild(this.element);
  }
  this.element = replacement;
};


/**
 * Removes the element's children.
 */
ElementWrapper.prototype.removeChildren = function() {
  for (var i = this.element.childNodes.length - 1; i >= 0; i--) {
    this.element.removeChild(this.element.childNodes[i]);
  }
};


/**
 * Replace the current element's children with the given fragment.
 *
 * @param {string|Element|ElementWrapper} htmlOrElement The fragment to replace
 *     the current element's children with.
 * @param {boolean=} opt_withChildren If true, use the replacement element's
 *     children as replacements for my children, not the replacement element
 *     itself.
 */
ElementWrapper.prototype.replaceChildren = function(htmlOrElement, opt_withChildren) {
  var replacement;
  if (typeof htmlOrElement == 'string') {
    replacement = ElementWrapper.fromHtml(htmlOrElement).element;
  } else {
    replacement = htmlOrElement.element || htmlOrElement;
  }

  this.removeChildren();

  if (!opt_withChildren) {
    this.element.appendChild(replacement);
  } else {
    for (var i = 0, len = replacement.childNodes.length; i < len; i++) {
      var child = replacement.childNodes[0];
      replacement.removeChild(child);
      this.element.appendChild(child);
    }
  }
};


/**
 * @return {Array} An array of string class names belonging to this element.
 */
ElementWrapper.prototype.classes = function() {
  return string.trim(this.element.className).split(/\s+/);
};


/**
 * @param {string} className A class name this element might have.
 * @return {boolean} Whether the current element has the given class name.
 */
ElementWrapper.prototype.hasClass = function(className) {
  var classes = this.classes();
  for (var i = 0; i < classes.length; i++) {
    if (classes[i] == className) {
      return true;
    }
  }
  return false;
};


/**
 * Add a class to an element, unless it already has the class name.
 * @param {string} className A class name this element might already have.
 */
ElementWrapper.prototype.addClass = function(className) {
  if (!this.hasClass(className)) {
    this.element.className = string.trim(this.element.className + ' ' + className);
  }
};


/**
 * Remove a class from an element, unless it does not have the class.
 * @param {string} className A class name this element might have.
 */
ElementWrapper.prototype.removeClass = function(classToRemove) {
  var classes = iter.filter(this.classes(), function(className) {
    return className != classToRemove;
  });

  this.element.className = classes.join(' ');
};


/**
 * Add a class if the element doesn't have it yet; remove it if it does have
 * it already.
 *
 * @param {string} className A class name this element might have.
 */
ElementWrapper.prototype.toggleClass = function(className) {
  if (this.hasClass(className)) {
    this.removeClass(className);
  } else {
    this.addClass(className);
  }
};


/**
 * Retrieve an item from the element's dataset.
 *
 * @param {string} key The "attribute-style" key name, which should be
 *     lowercase and hyphenated. For an attribute named data-foo-bar="baz",
 *     this would be "foo-bar".
 * @return {string?} The dataset element if it is set.
 */
ElementWrapper.prototype.getData = function(key) {
  if (this.element.dataset) {
    return this.element.dataset[string.camelCase(key)];
  }
  return this.element.getAttribute('data-' + key);
};


/**
 * Set an item into the element's dataset.
 *
 * @param {string} key The "attribute-style" key name, which should be
 *     lowercase and hyphenated. For an attribute eg. data-foo-bar="baz",
 *     this would be "foo-bar".
 * @param {string} value The string value to set into the dataset. If this
 *     element is not a string, it will be returned as one from getData().
 */
ElementWrapper.prototype.setData = function(key, value) {
  if (this.element.dataset) {
    this.element.dataset[string.camelCase(key)] = value;
  } else {
    this.element.setAttribute('data-' + key, value);
  }
};


/**
 * @return {string} The text content of this node.
 */
ElementWrapper.prototype.getText = function() {
  if (typeof this.element.textContent !== 'undefined') {
    return this.element.textContent;
  } else if (typeof this.element.innerText !== 'undefined') {
    return this.element.innerText;
  } else {
    return this.element.innerHTML;
  }
};


/**
 * Set text content of this node.
 *
 * @param {string} value The text to set as the text content of this node.
 */
ElementWrapper.prototype.setText = function(value) {
  this.element.innerHTML = string.escapeHtml(value);
};



/**
 * @return {string} The value of the input or textarea.
 */
ElementWrapper.prototype.value = function() {
  return this.element.value;
};


/**
 * Set this element as disabled.
 */
ElementWrapper.prototype.disable = function() {
  this.element.disabled = true;
};


/**
 * Set this element as not disabled.
 */
ElementWrapper.prototype.enable = function() {
  this.element.disabled = false;
};


/**
 * Append this element to another element.
 *
 * @param {Element|ElementWrapper} toElement My new parent element.
 */
ElementWrapper.prototype.appendTo = function(toElement) {
  (toElement.element || toElement).appendChild(this.element);
};


/**
 * Append an element or HTML string to the current element, maintaining
 * the existing DOM structure.
 *
 * @param {Element|ElementWrapper|string} htmlOrElement The HTML fragment
 *     or DOM node to append.
 */
ElementWrapper.prototype.append = function(htmlOrElement) {
  var elements;
  if (typeof htmlOrElement == 'string') {
    elements = ElementWrapper.elementsFromHtml(htmlOrElement);
  } else if (htmlOrElement.length) {
    elements = htmlOrElement;
  } else {
    elements = [htmlOrElement];
  }

  iter.forEach(elements, function(element) {
    this.element.appendChild(element.element || element);
  }, this);
};


module.exports = ElementWrapper;
