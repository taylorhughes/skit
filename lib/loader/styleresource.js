

function StyleResource(source) {
  this.source = source;
}
module.exports.StyleResource = StyleResource;

StyleResource.prototype.getCssString = function() {
  return this.source;
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
