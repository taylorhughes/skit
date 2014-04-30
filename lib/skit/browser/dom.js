
var ElementWrapper = skit.client.ElementWrapper;


var module = {};


module.$ = function(el) {
  return new ElementWrapper(el);
};


return module;