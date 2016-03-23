'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var uglify = require('uglify-js');

var SkitModule = require('./loader/SkitModule');
var loader = require('./loader/loader');
var scriptresource = require('./loader/scriptresource');
var skitutil = require('./skitutil');


var TargetEnvironment = scriptresource.TargetEnvironment;
var HASH_FUNCTION = 'sha256';


//
// OPTIMIZER
//


function VersionedFile(opt_name) {
  this.filename_ = opt_name || null;
  this.resourcePaths_ = [];
}
VersionedFile.prototype.addResourcePath = function(path) {
  this.resourcePaths_.push(path);
};
VersionedFile.prototype.getResourcePaths = function() {
  return this.resourcePaths_.slice();
};
VersionedFile.prototype.filename_ = null;
VersionedFile.prototype.setFilename = function(filename) {
  if (this.filename_) {
    throw new Error('filename already set');
  }
  this.filename_ = filename;
};
VersionedFile.prototype.getFilename = function() { return this.filename_; };
VersionedFile.prototype.bundle = null;
VersionedFile.prototype.content_ = null;
VersionedFile.prototype.setContent = function(content) {
  if (this.hash_) {
    throw new Error('hash already computed')
  }
  this.content_ = content;
};
VersionedFile.prototype.getContent = function() { return this.content_; };
VersionedFile.prototype.hash_ = null;
VersionedFile.prototype.getHash = function() {
  return this.hash_;
};
VersionedFile.prototype.computeHash = function() {
  var hasher = crypto.createHash(HASH_FUNCTION).update(
      this.content_.replace ? new Buffer(this.content_, 'utf8') : this.content_);
  this.hash_ = hasher.digest('base64');
};
VersionedFile.prototype.getIntegrity = function() {
  if (!this.hash_) {
    throw new Error('Hash not computed yet');
  }

  return HASH_FUNCTION + '-' + this.hash_;
};
VersionedFile.prototype.getVersionedFilename = function(staticPrefix, publicStaticRoot) {
  if (!this.hash_) {
    throw new Error('Hash not computed yet');
  }

  var parts = this.filename_.split('.');
  parts[0] += '-v' + this.hash_.replace(/\+/g, '-').replace(/\//g, '_').substring(0, 24);
  var filename = parts.join('.');

  if (publicStaticRoot) {
    return filename.replace(staticPrefix, publicStaticRoot);
  }
  return filename;
};


function optimizeServer(server, optimizedPackagePath, opt_options) {
  optimizedPackagePath = path.resolve(optimizedPackagePath);

  var options = opt_options || {};

  var aliasMapFilename = options.aliasMap;

  var staticPrefix = '/' + server.staticPrefix;
  var publicStaticRoot = options.staticRoot || '';

  var addFile;
  var forEachFile;
  (function createFilesCollection() {
    var allFiles_ = {};

    addFile = function(file) {
      if (!file.getFilename()) {
        throw new Error('filename not set yet')
      }
      allFiles_[file.getFilename()] = file;
    };

    forEachFile = function(fn) {
      for (var filename in allFiles_) {
        fn(allFiles_[filename]);
      }
    };
  })();

  server.loader.allBundles().forEach(function(bundle) {
    var bundleScripts = [];
    var bundleStylesheets = [];

    console.log('Building bundle "' + bundle.name + '"...');

    var cssFile = new VersionedFile(path.join(staticPrefix, bundle.name + '.css'));
    bundle.allStyles().forEach(function(css) {
      var body = css.bodyContentType().body;
      bundleStylesheets.push(body);

      cssFile.addResourcePath(css.resourcePath);
    });
    cssFile.bundle = bundle;
    cssFile.setContent(bundleStylesheets.join('\n'));
    addFile(cssFile);

    var jsFile = new VersionedFile(path.join(staticPrefix, bundle.name + '.js'));
    bundle.allScripts().forEach(function(script) {
      if (!script.includeInEnvironment(TargetEnvironment.BROWSER)) {
        return;
      }

      var body = script.bodyContentType().body;
      bundleScripts.push(body);
      jsFile.addResourcePath(script.resourcePath);
    });
    jsFile.bundle = bundle;
    jsFile.setContent(bundleScripts.join('\n'));
    addFile(jsFile);
  });

  // VERSION, UPDATE AND COPY ALL STATIC FILES

  console.log('Loading raw files that might need updated references...');

  var resolvedPackagePath = server.packagePath;
  if (resolvedPackagePath.charAt(resolvedPackagePath.length - 1) == '/') {
    resolvedPackagePath = resolvedPackagePath.substring(0, resolvedPackagePath.length - 1);
  }

  loader.walkSync(resolvedPackagePath).forEach(function(filename) {
    var basename = path.basename(filename);
    if (basename.indexOf('.') == 0) {
      return;
    }

    var relativeFilename = filename.replace(server.packagePath, '');
    var file = new VersionedFile(relativeFilename);

    var content = fs.readFileSync(filename);
    var stringContent = content + '';
    if (stringContent.indexOf('\ufffd') == -1) {
      content = stringContent;
    }
    file.setContent(content);

    addFile(file);
  });

  // BUILD UNBUNDLED RESOURCE FILES AS IF THEY WERE REAL FILES, TOO

  console.log('Loading any unbundled public resources to static root...');

  (function loadUnbundledModuleFiles() {
    // organize these by resource path and cache.
    var filesByResourcePath = {};
    forEachFile(function(file) {
      file.getResourcePaths().forEach(function(resourcePath) {
        filesByResourcePath[resourcePath] = file;
      });
    });

    // load ALL module files in the whole enchilada.
    var allPublicModules = server.loader.getPublicRoot().descendants();
    allPublicModules.forEach(function(module) {
      if (!(module instanceof SkitModule)) {
        // just a parent dir.
        return;
      }

      module.buildResourceList().forEach(function(res) {
        if (filesByResourcePath[res.resourcePath]) {
          // already in a bundle.
          return;
        }

        if (res.includeInEnvironment && !res.includeInEnvironment(TargetEnvironment.BROWSER)) {
          return;
        }

        var bodyContentType = res.bodyContentType();
        var extension = '.js';
        if (bodyContentType.contentType.indexOf('/css') > 0) {
          extension = '.css';
        }
        var relativeFilename = res.resourcePath.replace(/[:\.]/g, '_') + extension;
        var staticFilename = path.join(staticPrefix, '__resource__', relativeFilename);

        var file = new VersionedFile(staticFilename);
        file.setContent(bodyContentType.body);
        addFile(file);
      });
    });
  })();


  // Minify these before doing the versioning in order to minimize the number
  // of changes that actually generate new versions of these files.
  // ie. comments / whitespace / local variable names should not create new
  // versions as long as we minify first.
  forEachFile(function(file) {
    var filename = file.getFilename();

    if (/\.js$/.test(filename) && filename.indexOf(staticPrefix) == 0) {
      console.log('Minifying:', filename, '...');

      var uglifyOptions = {fromString: true};

      // Allow bundle to specify uglify options.
      var bundle = file.bundle;
      if (bundle && bundle.options) {
        if ('minify' in bundle.options && !bundle.options.minify) {
          // continue;
          return;
        }

        if (bundle.options.uglifyOptions) {
          for (var k in bundle.options.uglifyOptions) {
            uglifyOptions[k] = bundle.options.uglifyOptions[k];
          }
        }
      }

      var minified = uglify.minify(file.getContent(), uglifyOptions).code;
      file.setContent(minified);
    }
  });

  (function doRecursiveVersioning() {
    console.log('Versioning static files...');

    var fileByName = {};
    var staticBasenames = {};
    forEachFile(function(file) {
      var filename = file.getFilename();
      fileByName[filename] = file;
      if (filename.indexOf(staticPrefix) == 0) {
        staticBasenames[path.basename(filename)] = 1;
      }
    });
    var escapedBasenames = Object.keys(staticBasenames).map(function(basename) {
      return skitutil.escapeRegex(basename);
    });
    var buildFilenamesRegex = new RegExp(
        "(['\"(])(/?(?:[\\w.-]+/)*(?:" + escapedBasenames.join('|') + "))(\\\\?['\")])", 'g');

    function updateFileAndReferences(file) {
      if (!file.getHash()) {
        if (file.visiting) {
          throw new Error('Cyclical dependency! ' + file.getFilename());
        }
        file.visiting = true;

        var content = file.getContent();
        if (content.replace) {
          content = content.replace(buildFilenamesRegex, function(_, quote1, filenameMatch, quote2) {
            if (filenameMatch.indexOf('/') != 0 && filenameMatch.indexOf('://') == -1) {
              filenameMatch = path.join(path.dirname(filename), filenameMatch);
            }

            var referencedFile = fileByName[filenameMatch];
            if (referencedFile) {
              filenameMatch = updateFileAndReferences(referencedFile);
            }
            return quote1 + filenameMatch + quote2;
          });

          // this will fail if the node has already been visited.
          file.setContent(content);
        }

        // After all the replacements are done, actually update the file.
        file.computeHash();
        delete file.visiting;
      }

      return file.getVersionedFilename(staticPrefix, publicStaticRoot);
    }

    forEachFile(updateFileAndReferences);
  })();


  (function buildAliasMap() {
    var moduleToStaticAliasMap = {};
    forEachFile(function(file) {
      var paths = file.getResourcePaths();
      paths.forEach(function(resourcePath) {
        moduleToStaticAliasMap[resourcePath] = {
          path: file.getVersionedFilename(staticPrefix, publicStaticRoot),
          integrity: file.getIntegrity(),
        };
      });
    });

    var aliasMap = new VersionedFile(aliasMapFilename);
    aliasMap.setContent(JSON.stringify(moduleToStaticAliasMap, null, '  '));
    aliasMap.computeHash();
    addFile(aliasMap);
  })();

  // WRITE ALL OPTIMIZED FILES TO DISK

  (function writeAllFiles() {
    console.log('Writing optimized files to disk...');

    loader.mkdirPSync(optimizedPackagePath);

    forEachFile(function(file) {
      var body = file.getContent();

      var filename = file.getFilename();
      var outfiles = [filename];
      if (filename.indexOf(staticPrefix) === 0) {
        // NOTE: Leave staticPrefix here because these are local filenames.
        outfiles.push(file.getVersionedFilename());
      }

      outfiles.forEach(function(destinationFilename) {
        var absoluteFilename = path.join(optimizedPackagePath, destinationFilename);
        loader.mkdirPSync(path.dirname(absoluteFilename));

        fs.writeFileSync(absoluteFilename, body);
      });
    });
  })();

  console.log('All done!');
}


module.exports = {
  optimizeServer: optimizeServer
};