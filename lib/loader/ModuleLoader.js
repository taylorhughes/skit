'use strict';

var vm = require('vm');

var scriptresource = require('./scriptresource');
var TargetEnvironment = scriptresource.TargetEnvironment;


function ModuleLoader(module) {
  this.module = module;
  this.load_();
}


ModuleLoader.prototype.load_ = function() {
  var allResources = this.module.buildResourceList();

  // TODO(Taylor): Limit require() usage here to specific modules?
  // Or provide a few globally required things?
  var context = vm.createContext({
    require: require,
    console: console,
  });

  var objectsByResourcePath = {};
  var objectsByModulePath = {};
  var mainObject = null;
  var mainObjectResource = null;
  for (var i = 0; i < allResources.length; i++) {
    var resource = allResources[i];
    if (resource.getCssString) {
      continue;
    }

    if (!resource.includeInEnvironment(TargetEnvironment.SERVER)) {
      continue;
    }

    var script = resource.__script__;
    if (!script) {
      // Errors here bubble up to the try/catch around serveController().
      var functionString = resource.getFunctionString();
      script = resource.__script__ = vm.createScript(functionString, resource.filePath);
    }

    var evaluatedFunction = script.runInContext(context);
    var evaluatedDependencies = resource.getAbsoluteDependencyPaths().map(function(dependencyPath) {
      return objectsByResourcePath[dependencyPath];
    });

    var evaluated = evaluatedFunction.apply({}, evaluatedDependencies);
    objectsByResourcePath[resource.resourcePath] = evaluated;
    // This might be set multiple times for multiple resources in a module,
    // but will eventually be correct.
    objectsByModulePath[resource.resourcePath.split(':')[0]] = evaluated;
    mainObject = evaluated;
    mainObjectResource = resource;
  };

  this.objectsByResourcePath_ = objectsByResourcePath;
  this.objectsByModulePath_ = objectsByModulePath;
  this.mainObject_ = mainObject;
  this.mainObjectResourcePath_ = mainObjectResource;
};


ModuleLoader.prototype.mainObject = function() {
  return this.mainObject_;
};


ModuleLoader.prototype.mainObjectResourcePath = function() {
  return this.mainObjectResourcePath_;
};


ModuleLoader.prototype.objectAtResourcePath = function(resourcePath) {
  return this.objectsByResourcePath_[resourcePath];
};


ModuleLoader.prototype.objectAtModulePath = function(modulePath) {
  return this.objectsByModulePath_[modulePath];
};


module.exports = ModuleLoader;
