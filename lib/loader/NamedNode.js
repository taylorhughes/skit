

function NamedNode(name) {
  this.name = name;
  this.parentNamedNode = null;
  this.children_ = {};
};


NamedNode.prototype.root = function() {
  var current = this;
  while (current.parentNamedNode) {
    current = current.parentNamedNode;
  }
  return current;
};


NamedNode.prototype.findNodeWithPath = function(components) {
  var current = this;
  while (current && components.length) {
    current = current.getChildWithName(components[0]);
    components = components.slice(1);
  }
  return current;
};


NamedNode.prototype.addChildNode = function(node) {
  if (node.parentNamedNode) {
    node.parentNamedNode.removeChildNode(node);
  }
  node.parentNamedNode = this;
  this.children_[node.name] = node;
};


NamedNode.prototype.removeChildNode = function(node) {
  if (node.parentNamedNode === this) {
    delete this.children_[node.name];
    node.parentNamedNode = null;
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


NamedNode.prototype.getLeafChildren = function() {
  var leaves = [];
  for (var name in this.children_) {
    var child = this.children_[name];
    if (child.isLeaf()) {
      leaves.push(child);
    }
  }
  return leaves;
};


NamedNode.prototype.isLeaf = function() {
  return this.children_.length == 0;
};


NamedNode.prototype.toJSON = function() {
  var result = {'__name__': this.name};
  for (var sub in this.children_) {
    result[sub] = this.children_[sub];
  }
  return result;
};

NamedNode.prototype.toString = function() {
  var parts = [];
  var current = this;
  while (current) {
    parts.unshift(current.name);
    current = current.parentNamedNode;
  }
  return parts.join('.');
};


module.exports = NamedNode;
