'use strict';

var path = require('path');
var SkitModule = require('./SkitModule');
var loader = require('./loader');



function validateBundleConfiguration(bundles) {
  if (!Array.isArray(bundles)) {
    throw new Error('Bundles should be an array of bundle configuration objects.');
  }

  bundles.forEach(function(bundle) {
    if (!bundle) {
      throw new Error('Bundle configuration should be an object.');
    }
    for (var k in bundle) {
      if (['name', 'paths', 'modules', 'options'].indexOf(k) < 0) {
        throw new Error('Unknown bundle configuration key: ' + k + '.');
      }
    }
    if (!bundle.name) {
      throw new Error('Add "name" key to bundle configuration.');
    }
    if (!(bundle.paths || bundle.modules || []).length) {
      throw new Error('Add "paths" or "modules" to bundle configuration.');
    }
    (bundle.paths || []).forEach(function(p) {
      var index = p.indexOf('*');
      if (index >= 0 && index < p.length - 1) {
        throw new Error('Star in "path" must be last character, or not present.');
      }
    });
  });
}


function ResourceBundle(name, modules, previouslyIncludedResources, opt_options) {
  this.name = name;

  this.resourcePaths = {};
  this.modulePaths = {};
  this.styles = [];
  this.scripts = [];
  this.options = opt_options || {};

  modules.forEach(function(module) {
    this.modulePaths[module.modulePath] = module;

    var allResources = module.buildResourceList();
    allResources.forEach(function(resource) {
      if (!(resource.resourcePath in previouslyIncludedResources) &&
          !(resource.resourcePath in this.resourcePaths)) {
        this.resourcePaths[resource.resourcePath] = resource;

        if (resource.getCssString) {
          this.styles.push(resource);
        } else {
          this.scripts.push(resource);
        }
      }
    }, this);
  }, this);
}

ResourceBundle.prototype.containsResourcePath = function(resourcePath) {
  return resourcePath in this.resourcePaths;
};

ResourceBundle.prototype.allResourcePaths = function() {
  return Object.keys(this.resourcePaths);
};

ResourceBundle.prototype.allScripts = function() {
  return this.scripts;
};

ResourceBundle.prototype.allStyles = function() {
  return this.styles;
};



function allSkitModulesInRoot(root) {
  var skitModules = [];

  var children = root.children();
  while (children.length) {
    var child = children.shift();
    if (child instanceof SkitModule) {
      skitModules.push(child);
    } else {
      children = children.concat(child.children());
    }
  }

  return skitModules;
}


function pathToModulePathComponents_(fullPath) {
  var parts = fullPath.split(path.sep);
  if (parts[0] == '') {
    parts.splice(0, 1);
  }
  if (parts[parts.length - 1] == '') {
    parts.pop();
  }
  return parts;
}


function BundledLoader(packagePath, publicRootName, bundleConfig) {
  this.packagePath_ = packagePath;
  this.publicRootName_ = publicRootName;
  validateBundleConfiguration(bundleConfig);
  this.bundleConfig_ = bundleConfig;

  this.load_();
}


BundledLoader.prototype.reload = function() {
  this.load_();
};


BundledLoader.prototype.load_ = function() {
  console.log('[skit] loading module tree')
  var root = loader.buildModuleTree(this.packagePath_);
  var skit = loader.loadSkitTree();
  root.addChildNode(skit);
  this.root_ = root;

  var previouslyIncludedResources = {};
  this.bundles_ = this.bundleConfig_.map(function(bundle) {
    var bundle = this.loadBundleFromConfig_(bundle, previouslyIncludedResources);
    bundle.allResourcePaths().forEach(function(modulePath) {
      previouslyIncludedResources[modulePath] = 1;
    });
    return bundle;
  }, this);
};


BundledLoader.prototype.getPublicRoot = function() {
  return this.root_.getChildWithName(this.publicRootName_);
};


BundledLoader.prototype.loadBundleFromConfig_ = function(config, previouslyIncludedResources) {
  var modulesToInclude = [];

  var paths = config.paths || [];
  paths.forEach(function(fullPath) {
    var parts = pathToModulePathComponents_(fullPath);
    var publicRoot = this.getPublicRoot();

    // parts can be empty for "/", which should just be the homepage module.
    var lastPart = parts[parts.length - 1] || '';
    if (lastPart.indexOf('*') >= 0) {
      var matcher = parts.pop();
      var base = publicRoot.findNodeWithPathComponents(parts);
      matcher = matcher.substring(0, matcher.length - 1);
      if (!matcher) {
        // matcher is '*' for this path -- include all my children, which includes
        // the controller at this path. (eg. /* -- includes /Home.js and /foo/Foo.js)
        var allMyModules = allSkitModulesInRoot(base);
        modulesToInclude = modulesToInclude.concat(allMyModules);
      } else {
        // matcher has a child path, so filter my children based on that and don't
        // include modules at this level.
        base.eachChild(function(node) {
          if (node.name.indexOf(matcher) == 0) {
            var allMyModules = allSkitModulesInRoot(node);
            modulesToInclude = modulesToInclude.concat(allMyModules);
          }
        }, this);
      }

    } else {
      var base = publicRoot.findNodeWithPathComponents(parts);
      base.eachChild(function(node) {
        if (node instanceof SkitModule) {
          modulesToInclude.push(node);
        }
      }, this);

    }
  }, this);

  var modules = config.modules || [];
  modules.forEach(function(moduleName) {
    var module = this.root_.findNodeWithPath(moduleName);
    if (!module) {
      throw new Error('Unable to find module: ' + moduleName + ' for bundle: ' + config.name);
    }

    if (module instanceof SkitModule) {
      modulesToInclude.push(module);
    } else {
      // recursively find all children that are skit modules.
      module.descendants().forEach(function(module) {
        if (module instanceof SkitModule) {
          modulesToInclude.push(module);
        }
      });
    }
  }, this);

  return new ResourceBundle(config.name, modulesToInclude, previouslyIncludedResources, config.options);
};


BundledLoader.prototype.bundlesRequiredForModule = function(module) {
  var allResourcePaths = module.buildResourceList().map(function(res) {
    return res.resourcePath;
  }, this);

  var needsCatchallBundle = false;
  var includedResourcePaths = {};
  var bundles = [];

  // Load these backwards, because dependencies start from the
  // target (last) module rather than the other way around.
  allResourcePaths.reverse();
  allResourcePaths.forEach(function(resourcePath) {
    var includedBundle = includedResourcePaths[resourcePath];
    if (includedBundle) {
      // continue;
      return;
    }

    var notFound = this.bundles_.every(function(bundle) {
      if (bundle.containsResourcePath(resourcePath)) {
        bundles.push(bundle);
        bundle.allResourcePaths().forEach(function(rp) {
          includedResourcePaths[rp] = bundle.name;
        });
        return false;
      }
      return true;
    }, this);

    if (notFound) {
      needsCatchallBundle = true;
    }
  }, this);

  bundles.reverse();
  if (needsCatchallBundle) {
    bundles.push(new ResourceBundle('catchall', [module], includedResourcePaths));
  }

  return bundles;
};


BundledLoader.prototype.allBundles = function() {
  return this.bundles_;
};


BundledLoader.prototype.resourceAtModulePath = function(modulePath, resourceName) {
  var module = this.root_.findNodeWithPath(modulePath);
  if (module) {
    return module.getResourceNamed(resourceName);
  }
  return null;
};


module.exports = BundledLoader;
