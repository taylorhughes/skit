
var Controller = skit.platform.Controller;
var string = skit.platform.string;
var Handlebars = skit.thirdparty.handlebars;

Handlebars.registerHelper('slugify', function(arg) {
  return string.trim(arg).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
});

return Controller.create({});
