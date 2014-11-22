'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var fs = require('fs');

var Handlebars = require('handlebars');

var skitutil = require('./skitutil');


var ERROR_TEMPLATE = (function() {
  var templateSource = fs.readFileSync(__dirname + '/error.html').toString();
  return Handlebars.compile(templateSource);  
})();


function renderError(req, res, error) {
  var message = error.message || 'Error processing request';

  console.log('Rendering error response for:', req.url, 'stack:', error.stack);

  var fileName, lineNumber;
  if (error.fileName) {
    fileName = error.fileName;
    lineNumber = error.lineNumber;
  } else if (error.stack) {
    var firstLine = error.stack.split(/\n/)[1];
    var fileAndLineNumber = firstLine.match(/\((\/.+):(\d+):\d+\)$/);
    if (fileAndLineNumber) {
      fileName = fileAndLineNumber[1];
      lineNumber = +(fileAndLineNumber[2]);
    }
  }

  var excerptHtml;
  if (fileName && lineNumber) {
    var fileContent = '<unknown file>';
    try {
      fileContent = fs.readFileSync(fileName, 'utf8');
    } catch (e) {
      console.log('Could not read file: ', e);
    }

    var lines = fileContent.split(/\n/).map(function(line, i) {
      line = '<b>' + ('   ' + (i + 1)).slice(-4) + '</b>' + skitutil.escapeHtml(line);
      if (i == lineNumber - 1) {
        line = '<span class="current">' + line + '</span>';
      }
      return line;
    });
    var relevantLines = lines.slice(Math.max(0, lineNumber - 5), lineNumber + 5);
    excerptHtml = relevantLines.join('\n');
  }

  var html = ERROR_TEMPLATE({
    message: message,
    code: error.status,
    error: error,
    fileName: fileName,
    lineNumber: lineNumber,
    excerptHtml: excerptHtml
  });

  res.writeHead(error.status || 502, {'Content-Type': 'text/html; charset=utf-8'});
  res.write(html);
  res.end();
}


module.exports = {
  renderError: renderError
};
