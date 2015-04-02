'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


function StyleResource(filePath, resourcePath, source) {
  this.filePath = filePath;
  this.resourcePath = resourcePath;
  this.source = source;
}
module.exports.StyleResource = StyleResource;

StyleResource.prototype.getCssString = function() {
  return this.source;
};

StyleResource.prototype.bodyContentType = function() {
  return {
    contentType: 'text/css',
    body: this.getCssString()
  };
};


var RESOURCE_WRAPPERS = {};


function setResourceWrapper(extension, fn) {
  RESOURCE_WRAPPERS[extension] = fn;
}
module.exports.setResourceWrapper = setResourceWrapper;


function getResourceWrapper(extension) {
  return RESOURCE_WRAPPERS[extension] || null;
}
module.exports.getResourceWrapper = getResourceWrapper;


setResourceWrapper('.css', StyleResource);
