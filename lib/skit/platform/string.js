'use strict';

/**
 * @module
 * @license
 * (c) 2014 Cluster Labs, Inc. https://cluster.co/
 * License: MIT
 */

var iter = skit.platform.iter;


/**
 * @param {string} str A string with whitespace, eg. "  abc ".
 * @return {string} A trimmed string, eg. "abc".
 */
module.exports.trim = function trim(str) {
  return (str || '').replace(/^\s+|\s+$/g, '');
};


/**
 * @param {string} str A string, eg. "abc".
 * @return {string} The string with the first letter capitalized, eg. "Abc".
 */
module.exports.capitalize = function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
};


/**
 * @param {string} str A hyphenated string, eg. "abc-def".
 * @return {string} The string converted to camel case, eg. "abcDef".
 */
module.exports.camelCase = function camelCase(str) {
  var substrs = str.split('-');
  var first = substrs[0];
  substrs = iter.map(substrs.slice(1), function(substr) {
    return module.exports.capitalize(substr);
  });
  return [first].concat(substrs).join('');
};


var replaceHtmlChars = /[&<>"'`]/g;
var charToHtml = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;"
};


/**
 * @param {string} str A string potentially containing HTML.
 * @return {string} The string with meaningful HTML characters (&, <, >, ", ', `) escaped.
 */
module.exports.escapeHtml = function escapeHtml(str) {
  if (!str) {
    return str;
  }
  return str.replace(replaceHtmlChars, function(c) {
    return charToHtml[c];
  });
};


/**
 * @param {string} str A string potentially containing RegExp special chars.
 * @return {string} The string with any RegExp special characters escaped.
 */
module.exports.escapeRegex = function escapeRegex(str) {
  if (!str) { return str; }
  return str.replace(/[\[\]\/\\{}()*+?.^$|-]/g, '\\$&');
};


/**
 * @param {string} str A string not suitable for a URL or variable name, eg. "Señor Sisig"
 * @param {string=} opt_hyphen The space replacement character, defaults to "-".
 * @return {string} A slugified string, eg. "senor-sisig".
 */
module.exports.slugify = function slugify(str, opt_hyphen) {
  var hyphen = opt_hyphen || '-';
  var accents = "àáäâèéëêìíïîòóöôùúüûñç";
  var without = "aaaaeeeeiiiioooouuuunc";

  return (str.toLowerCase()
    .replace(
      new RegExp('[' + accents + ']', 'g'),
      function (c) { return without.charAt(accents.indexOf(c)); })
    .replace(/[^a-z0-9]+/g, hyphen)
    .replace(new RegExp('^' + hyphen + '|' + hyphen + '$', 'g'), '')
  );
};