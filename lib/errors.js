'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var fs = require('fs');

var Handlebars = require('handlebars');

var util = require('./util');


var ERROR_TEMPLATE = (function() {
  var templateSource = fs.readFileSync(__dirname + '/error.html').toString();
  return Handlebars.compile(templateSource);  
})();


function renderError(res, opt_e, opt_message, opt_code) {
  var message = opt_message || 'Error processing request';

  var fileName, lineNumber;
  if (opt_e && opt_e.fileName) {
    fileName = opt_e.fileName;
    lineNumber = opt_e.lineNumber;
  } else if (opt_e && opt_e.stack) {
    var firstLine = opt_e.stack.split(/\n/)[1];
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
      line = '<b>' + ('   ' + (i + 1)).slice(-4) + '</b>' + util.escapeHtml(line);
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
    code: opt_code,
    error: opt_e,
    fileName: fileName,
    lineNumber: lineNumber,
    excerptHtml: excerptHtml
  });

  res.writeHead(opt_code || 502, {'Content-Type': 'text/html; charset=utf-8'});
  res.write(html);
  res.end();
}


module.exports = {
  renderError: renderError
};
