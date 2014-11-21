'use strict';
'browser-only';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var util = skit.platform.util;
var zest = skit.thirdparty.zest;


var ELEMENT_NODE_TYPE = 1;


var ElementWrapper = function(element) {
  this.element = element;
};


ElementWrapper.elementsFromHtml = function(html) {
  var div = document.createElement('div');
  div.innerHTML = html;
  return (new ElementWrapper(div)).children();
};


ElementWrapper.fromHtml = function(html) {
  return ElementWrapper.elementsFromHtml(html)[0];
};


ElementWrapper.prototype.children = function() {
  var filtered;
  if (this.element.children) {
    filtered = util.toArray(this.element.children);
  } else {
    filtered = util.filter(this.element.childNodes, function(node) {
      return node.nodeType == ELEMENT_NODE_TYPE;
    });
  }

  return util.map(filtered, function(element) {
    return new ElementWrapper(element);
  });
};


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


ElementWrapper.prototype.parent = function() {
  if (this.element.parentNode && this.element.parentNode.nodeType == ELEMENT_NODE_TYPE) {
    return new ElementWrapper(this.element.parentNode);
  }
  return null;
};


ElementWrapper.prototype.matches = function(selector) {
  return zest.matches(this.element, selector);
};


ElementWrapper.prototype.find = function(selector) {
  return util.map(zest(selector, this.element), function(el) {
    return new ElementWrapper(el);
  });
};


ElementWrapper.prototype.get = function(selector) {
  var found = this.find(selector);
  return found.length ? found[0] : null;
};


ElementWrapper.prototype.$ = ElementWrapper.prototype.find;


ElementWrapper.prototype.first = function(selector) {
  var children = this.children();
  return children.length ? children[0] : null;
};


ElementWrapper.prototype.up = function(selector) {
  var current = this;
  while (current && !current.matches(selector)) {
    current = current.parent();
  }
  return current;
};


ElementWrapper.prototype.remove = function() {
  this.element.parentNode.removeChild(this.element);
};


ElementWrapper.prototype.replaceWith = function(htmlOrElement) {
  var replacement;
  if (typeof htmlOrElement == 'string') {
    replacement = ElementWrapper.fromHtml(htmlOrElement).element;
  } else {
    replacement = htmlOrElement.element || htmlOrElement;
  }

  this.element.parentNode.insertBefore(replacement, this.element);
  this.element.parentNode.removeChild(this.element);
  this.element = replacement;
};


ElementWrapper.prototype.replaceChildren = function(htmlOrElement, opt_withChildren) {
  var replacement;
  if (typeof htmlOrElement == 'string') {
    replacement = ElementWrapper.fromHtml(htmlOrElement).element;
  } else {
    replacement = htmlOrElement.element || htmlOrElement;
  }

  for (var i = this.element.childNodes.length - 1; i >= 0; i--) {
    this.element.removeChild(this.element.childNodes[i]);
  }

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


ElementWrapper.prototype.classes = function() {
  return util.trim(this.element.className).split(/\s+/);
};


ElementWrapper.prototype.hasClass = function(className) {
  var classes = this.classes();
  for (var i = 0; i < classes.length; i++) {
    if (classes[i] == className) {
      return true;
    }
  }
  return false;
};


ElementWrapper.prototype.addClass = function(className) {
  if (!this.hasClass(className)) {
    this.element.className = util.trim(this.element.className + ' ' + className);
  }
};


ElementWrapper.prototype.removeClass = function(classToRemove) {
  var classes = util.filter(this.classes(), function(className) {
    return className != classToRemove;
  });

  this.element.className = classes.join(' ');
};


ElementWrapper.prototype.toggleClass = function(className) {
  if (this.hasClass(className)) {
    this.removeClass(className);
  } else {
    this.addClass(className);
  }
};


ElementWrapper.prototype.getData = function(key) {
  if (this.element.dataset) {
    return this.element.dataset[util.camelCase(key)];
  }
  return this.element.getAttribute('data-' + key);
};


ElementWrapper.prototype.setData = function(key, value) {
  if (this.element.dataset) {
    return this.element.dataset[util.camelCase(key)] = value;
  }
  return this.element.setAttribute('data-' + key, value);
};


ElementWrapper.prototype.getText = function() {
  if (typeof this.element.innerText !== 'undefined') {
    return this.element.innerText;
  } else {
    return this.element.innerHTML;
  }
};


ElementWrapper.prototype.setText = function(value) {
  if (typeof this.element.innerText !== 'undefined') {
    this.element.innerText = value;
  } else {
    this.element.innerHTML = util.escapeHtml(value);
  }
};



ElementWrapper.prototype.value = function() {
  // TODO(Taylor): Implement for textareas.
  return this.element.value;
};


ElementWrapper.prototype.disable = function() {
  this.element.disabled = true;
};
ElementWrapper.prototype.enable = function() {
  this.element.disabled = false;
};


ElementWrapper.prototype.appendTo = function(toElement) {
  (toElement.element || toElement).appendChild(this.element);
};


ElementWrapper.prototype.append = function(htmlOrElement) {
  var elements;
  if (typeof htmlOrElement == 'string') {
    elements = ElementWrapper.elementsFromHtml(htmlOrElement);
  } else if (htmlOrElement.length) {
    elements = htmlOrElement;
  } else {
    elements = [htmlOrElement];
  }

  util.forEach(elements, function(element) {
    this.element.appendChild(element.element || element);
  }, this);
};


return ElementWrapper;
