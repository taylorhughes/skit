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


//
// OPTIMIZER
//


function staticFilename(filename, fileContent) {
  var parts = filename.split('.');
  var md5 = crypto.createHash('md5').update(fileContent).digest('hex');
  parts[0] += '-v' + md5.substring(0, 12);
  return parts.join('.');
}


function optimizeServer(server, optimizedPackagePath, opt_options) {
  var options = opt_options || {};

  var aliasMapFilename = options.aliasMap;
  var publicStaticRoot = options.staticRoot || '';

  // COMBINE MODULES FOR PUBLIC SERVING
  var STATIC_PREFIX = '/' + server.staticPrefix;

  var moduleToStaticAliasMap = {};

  var bundleFiles = {};
  var bundles = server.loader.allBundles();
  var bundlesByFilename = {};
  bundles.forEach(function(bundle) {
    var bundleScripts = [];
    var bundleStylesheets = [];

    var jsFilename = path.join(STATIC_PREFIX, bundle.name + '.js');
    bundlesByFilename[jsFilename] = bundle;
    var cssFilename = path.join(STATIC_PREFIX, bundle.name + '.css');
    bundlesByFilename[cssFilename] = bundle;

    console.log('Building bundle "' + bundle.name + '"...');

    bundle.allStyles().forEach(function(css) {
      moduleToStaticAliasMap[css.resourcePath] = cssFilename;

      var body = css.bodyContentType().body;
      bundleStylesheets.push(body);
    });

    bundle.allScripts().forEach(function(script) {
      if (!script.includeInEnvironment(TargetEnvironment.BROWSER)) {
        return;
      }
      moduleToStaticAliasMap[script.resourcePath] = jsFilename;

      var body = script.bodyContentType().body;
      bundleScripts.push(body);
    });

    bundleFiles[cssFilename] = bundleStylesheets.join('\n');
    bundleFiles[jsFilename] = bundleScripts.join('\n');
  });

  // ADD ANY FILES NOT IN BUNDLES

  var resolvedPackagePath = server.packagePath;
  if (resolvedPackagePath.charAt(resolvedPackagePath.length - 1) == '/') {
    resolvedPackagePath = resolvedPackagePath.substring(0, resolvedPackagePath.length - 1);
  }

  var filenameToContent = {};
  var staticFiles = [];

  // VERSION, UPDATE AND COPY ALL STATIC FILES

  console.log('Loading raw files that might need updated references...');

  var allFiles = loader.walkSync(resolvedPackagePath);

  allFiles.forEach(function(filename) {
    var basename = path.basename(filename);
    if (basename.indexOf('.') == 0) {
      return;
    }

    var relativeFilename = filename.replace(server.packagePath, '');

    var content = fs.readFileSync(filename);
    var stringContent = content + '';
    if (stringContent.indexOf('\ufffd') == -1) {
      content = stringContent;
    }

    filenameToContent[relativeFilename] = content;
    if (relativeFilename.indexOf(STATIC_PREFIX) == 0) {
      staticFiles.push(relativeFilename);
    }
  });

  // BUILD RAW BUNDLE FILES AS IF THEY WERE REAL FILES

  for (var bundleFilename in bundleFiles) {
    filenameToContent[bundleFilename] = bundleFiles[bundleFilename];
    staticFiles.push(bundleFilename);
  }

  // BUILD UNBUNDLED RESOURCE FILES AS IF THEY WERE REAL FILES, TOO

  console.log('Loading any unbundled public resources to static root...');

  var allPublicModules = server.loader.getPublicRoot().descendants();
  allPublicModules.forEach(function(module) {
    if (!(module instanceof SkitModule)) {
      // just a parent dir.
      return;
    }

    module.buildResourceList().forEach(function(res) {
      if (moduleToStaticAliasMap[res.resourcePath]) {
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
      var newStaticFilename = path.join(STATIC_PREFIX, '__resource__', relativeFilename);

      // Add this file to output dir and minify
      filenameToContent[newStaticFilename] = bodyContentType.body;
      // Load these modules from static instead of serving them
      moduleToStaticAliasMap[res.resourcePath] = newStaticFilename;

      // Version these new static files and update any references,
      // namely in alias map JSON.
      staticFiles.push(newStaticFilename);
    });
  });

  filenameToContent[aliasMapFilename] = JSON.stringify(moduleToStaticAliasMap, null, '  ');

  // Minify these before doing the versioning in order to minimize the number
  // of changes that actually generate new versions of these files.
  // ie. comments / whitespace / local variable names should not create new
  // versions as long as we minify first.
  var relativeFilenames = Object.keys(filenameToContent);
  relativeFilenames.forEach(function(filename) {
    var original = filenameToContent[filename];
    if (/\.js$/.test(filename) && filename.indexOf(STATIC_PREFIX) == 0) {
      console.log('Minifying:', filename, '...');

      var uglifyOptions = {fromString: true};

      // Allow bundle to specify uglify options.
      var bundle = bundlesByFilename[filename];
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

      filenameToContent[filename] = uglify.minify(original, uglifyOptions).code;
    }
  });

  console.log('Versioning static files...');

  var staticFilenamesIndex = {};
  staticFiles.forEach(function(filename) {
    var sfilename = staticFilename(filename, filenameToContent[filename]);
    // TODO(Taylor): Replace /__static__/ with https://foo/bar/.
    staticFilenamesIndex[filename] = sfilename;
  });

  console.log('Updating all references to static resources throughout the codebase...');

  var staticBasenames = {};
  staticFiles.forEach(function(filename) {
    staticBasenames[path.basename(filename)] = 1;
  });
  var escapedBasenames = Object.keys(staticBasenames).map(function(basename) {
    return skitutil.escapeRegex(basename);
  });
  var replaceContentRegex = new RegExp(
      "(['\"(])(/?(?:[\\w.-]+/)*(?:" + escapedBasenames.join('|') + "))(\\\\?['\")])", 'g');

  var relativeFilenames = Object.keys(filenameToContent);
  relativeFilenames.forEach(function(filename) {
    var original = filenameToContent[filename];
    if (!original.replace) {
      // Buffer, probably binary object.
      return;
    }

    filenameToContent[filename] = original.replace(replaceContentRegex, function(_, quote1, match, quote2) {
      if (match.indexOf('/') != 0 && match.indexOf('://') == -1) {
        match = path.join(path.dirname(filename), match);
      }
      if (match in staticFilenamesIndex) {
        match = staticFilenamesIndex[match];

        if (publicStaticRoot) {
          match = publicStaticRoot + match.replace(STATIC_PREFIX, '');
        }
      }
      return quote1 + match + quote2;
    });
  });

  // WRITE ALL OPTIMIZED FILES TO DISK

  console.log('Writing optimized files to disk...');

  var optimizedPackagePath = path.resolve(optimizedPackagePath);
  loader.mkdirPSync(optimizedPackagePath);

  relativeFilenames.forEach(function(filename) {
    var body = filenameToContent[filename];

    var outfiles = [filename];
    if (filename in staticFilenamesIndex) {
      outfiles.push(staticFilenamesIndex[filename]);
    }

    outfiles.forEach(function(destinationFilename) {
      var absoluteFilename = path.join(optimizedPackagePath, destinationFilename);
      loader.mkdirPSync(path.dirname(absoluteFilename));

      fs.writeFileSync(absoluteFilename, body);
    });
  });

  console.log('All done!');
}


module.exports = {
  optimizeServer: optimizeServer
};