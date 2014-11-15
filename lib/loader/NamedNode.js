'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


function NamedNode(name) {
  this.name = name;
  this.parent = null;
  this.children_ = {};
};


NamedNode.prototype.root = function() {
  var current = this;
  while (current.parent) {
    current = current.parent;
    if (current === this) {
      throw new Error('Cyclical tree.');
    }
  }
  return current;
};


NamedNode.prototype.findNodeWithPath = function(string, opt_separator) {
  var separator = opt_separator || '.';
  var components = string.split(separator).filter(function(s) { return !!s; });

  var current = this;
  while (current && components.length) {
    current = current.getChildWithName(components[0]);
    components = components.slice(1);
  }
  return current;
};


NamedNode.prototype.contains = function(node) {
  var current = node;
  while (current.parent) {
    current = current.parent;
    if (current === this) {
      return true;
    }
    if (current === node) {
      throw new Error('Cyclical tree.');
    }
  }
  return false;
};


NamedNode.prototype.order = function() {
  var i = 0;
  var current = this;
  while (current.parent) {
    current = current.parent;
    i++;
    if (current === this) {
      throw new Error('Cyclical tree.');
    }
  }
  return i;
};


NamedNode.prototype.addChildNode = function(node) {
  if (node.parent) {
    node.parent.removeChildNode(node);
  }
  node.parent = this;
  this.children_[node.name] = node;
};


NamedNode.prototype.removeChildNode = function(node) {
  if (node.parent === this) {
    delete this.children_[node.name];
    node.parent = null;
  }
};


NamedNode.prototype.getChildWithName = function(name) {
  return this.children_[name] || null;
};


NamedNode.prototype.children = function() {
  var children = [];
  for (var n in this.children_) {
    children.push(this.children_[n]);
  }
  return children;
};


NamedNode.prototype.childNames = function() {
  return Object.keys(this.children_);
};


NamedNode.prototype.descendants = function() {
  if (this.__handling) {
    throw new Error('Cyclical tree.');
  }
  this.__handling = true;

  var list = [];
  for (var n in this.children_) {
    var child = this.children_[n];
    child.descendants().forEach(function(child) {
      list.push(child);
    });
    list.push(child);
  }

  delete this.__handling;
  return list;
};


NamedNode.prototype.toJSON = function() {
  var result = {'__name__': this.name};
  for (var sub in this.children_) {
    result[sub] = this.children_[sub];
  }
  return result;
};


NamedNode.prototype.nodePath = function() {
  var parts = [];
  var current = this;
  while (current && current.name) {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts;
};


module.exports = NamedNode;
