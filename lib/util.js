'use strict';

/**
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */


function safeJSONStringify(arg) {
  return JSON.stringify(arg).replace(/[<>]/g, function(char) { return '\\x' + char.charCodeAt(0).toString(16) });
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