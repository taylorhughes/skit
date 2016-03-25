'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


function safeJSONStringify(arg, opt_pretty) {
  return JSON.stringify(arg, null, opt_pretty && ' ').replace(/[<>'&\u2028\u2029]/g, function(char) {
    var str = char.charCodeAt(0).toString(16);
    return '\\u0000'.substring(0, 2 + (4 - str.length)) + str;
  });
}

function escapeHtml(str) {
  return str && str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escapeRegex(str) {
  if (!str) { return str; }
  return str.replace(/[\[\]\/\\{}()*+?.^$|-]/g, '\\$&');
}

function unique(array) {
  var added = {};
  return array.filter(function(item) {
    if (item in added) {
      return false;
    }
    added[item] = true;
    return true;
  });
};

module.exports = {
  safeJSONStringify: safeJSONStringify,
  escapeHtml: escapeHtml,
  escapeRegex: escapeRegex,
  unique: unique,
};