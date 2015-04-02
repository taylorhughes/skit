'use strict';

var vm = require('vm');

var scriptresource = require('./scriptresource');
var TargetEnvironment = scriptresource.TargetEnvironment;


function ModuleLoaderPool(size) {
  this.size = size;
  this.available = size;
  this.built = 0;
  this.pool = [];
  this.waiters = [];
}

ModuleLoaderPool.prototype.getLoader = function(cb) {
  if (this.available) {
    this.available--;
    var loader = this.pool.shift();
    if (!loader) {
      loader = new ProgressiveModuleLoader();
      this.built++;
      //console.log('built new module loader');
    }
    cb(loader);
  } else {
    this.waiters.push(cb);
  }
};

ModuleLoaderPool.prototype.release = function(loader) {
  this.pool.push(loader);
  this.available++;

  if (this.waiters.length) {
    var cb = this.waiters.shift();
    this.getLoader(cb);
  }
};



function ProgressiveModuleLoader() {
  // TODO(Taylor): Limit require() usage here to specific modules?
  // Or provide a few globally required things?
  this.context = vm.createContext({
    require: require,
    console: console,
  });

  this.objectsByResourcePath = {};
  this.objectsByModulePath = {};
  this.mainResourceByModulePath = {};
}


ProgressiveModuleLoader.prototype.loadModule = function(module) {
  var allResources = module.buildResourceList();

  for (var i = 0; i < allResources.length; i++) {
    var resource = allResources[i];
    if (resource.getCssString || resource.resourcePath in this.objectsByResourcePath) {
      continue;
    }

    if (!resource.includeInEnvironment(TargetEnvironment.SERVER)) {
      continue;
    }

    // console.log('loading resource:', resource.resourcePath);

    var script = resource.__script__;
    if (!script) {
      // Errors here bubble up to the try/catch around serveController().
      var functionString = resource.getFunctionString();
      script = resource.__script__ = vm.createScript(functionString, resource.filePath);
    }

    var evaluatedFunction = script.runInContext(this.context);
    var evaluatedDependencies = resource.getAbsoluteDependencyPaths().map(function(resourcePath) {
      return this.objectsByResourcePath[resourcePath];
    }, this);

    var modulePath = resource.resourcePath.split(':')[0];

    var evaluated = evaluatedFunction.apply({}, evaluatedDependencies);
    this.objectsByResourcePath[resource.resourcePath] = evaluated;
    // This might be set multiple times for multiple resources in a module,
    // but will eventually be correct.
    this.objectsByModulePath[modulePath] = evaluated;
    this.mainResourceByModulePath[modulePath] = resource;
  };
};



function LoadedModuleScope(module, pool, loader) {
  this.module = module;

  this.pool = pool;
  this.loader = loader;
  this.loader.loadModule(module);

  this.mainObject = this.loader.objectsByModulePath[module.modulePath];
  this.mainObjectResourcePath = this.loader.mainResourceByModulePath[module.modulePath].resourcePath;
}

LoadedModuleScope.prototype.getObjectByResourcePath = function(resourcePath) {
  return this.loader.objectsByResourcePath[resourcePath];
};

LoadedModuleScope.prototype.getObjectByModulePath = function(modulePath) {
  return this.loader.objectsByModulePath[modulePath];
};

LoadedModuleScope.prototype.release = function() {
  if (!this.pool) {
    console.log('[skit internal] A loaded module scope was released multiple times.');
  }

  this.pool.release(this.loader);
  delete this.loader;
  delete this.pool;
};



var pools_ = {};

module.exports = {
  setPoolSize: function(name, size) {
    pools_[name] = new ModuleLoaderPool(size);
  },

  resetPool: function(name) {
    pools_[name] = new ModuleLoaderPool(pools_[name].size);
  },

  borrowModuleScope: function(name, module, cb) {
    var myPool = pools_[name];
    myPool.getLoader(function(loader) {
      var scope = new LoadedModuleScope(module, myPool, loader);
      cb(scope);
    });
  }
};
