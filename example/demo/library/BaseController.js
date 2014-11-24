
var Controller = skit.platform.Controller;
var util = skit.platform.util;
var Handlebars = skit.thirdparty.handlebars;

Handlebars.registerHelper('slugify', function(arg) {
  return util.trim(arg).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
});

return Controller.create({});
