
var ElementWrapper = skit.browser.ElementWrapper;


var module = {};


module.$ = function(el) {
  return new ElementWrapper(el);
};


return module;