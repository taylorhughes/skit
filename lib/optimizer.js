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
  bundles.forEach(function(bundle) {
    var bundleScripts = [];
    var bundleStylesheets = [];

    var jsFilename = path.join(STATIC_PREFIX, bundle.name + '.js');
    var cssFilename = path.join(STATIC_PREFIX, bundle.name + '.css');

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

  // VERSION, UPDATE AND COPY ALL STATIC FILES

  console.log('Loading raw files that might need updated references...');

  var resolvedPackagePath = server.packagePath;
  if (resolvedPackagePath.charAt(resolvedPackagePath.length - 1) == '/') {
    resolvedPackagePath = resolvedPackagePath.substring(0, resolvedPackagePath.length - 1);
  }

  var allFiles = loader.walkSync(resolvedPackagePath);

  var filenameToContent = {};
  var staticFiles = [];
  var staticBasenames = {};

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
      staticBasenames[path.basename(relativeFilename)] = true;
    }
  });

  // BUILD RAW BUNDLE FILES AS IF THEY WERE REAL FILES
  // Shunt these right in here so they get versioned and written out,
  // without having to actually do that manually.
  for (var bundleFilename in bundleFiles) {
    staticFiles.push(bundleFilename);
    filenameToContent[bundleFilename] = bundleFiles[bundleFilename];
    staticBasenames[path.basename(bundleFilename)] = true;
  }
  filenameToContent[aliasMapFilename] = JSON.stringify(moduleToStaticAliasMap);

  console.log('Versioning static files...');

  var staticFilenamesIndex = {};
  staticFiles.forEach(function(filename) {
    var sfilename = staticFilename(filename, filenameToContent[filename]);
    // TODO(Taylor): Replace /__static__/ with https://foo/bar/.
    staticFilenamesIndex[filename] = sfilename;
  });

  console.log('Updating all references to static resources throughout the codebase...');

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

  relativeFilenames.forEach(function(relativeFilename) {
    var outfiles = [relativeFilename];
    if (relativeFilename in staticFilenamesIndex) {
      outfiles.push(staticFilenamesIndex[relativeFilename]);
    }

    var body = filenameToContent[relativeFilename];
    if (/\.js$/.test(relativeFilename) && relativeFilename.indexOf(STATIC_PREFIX) == 0) {
      console.log('Minifying:', relativeFilename, '...');
      body = uglify.minify(body, {fromString: true}).code;
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