

var util = skit.platform.util;


function Controller(things) {
  this.things = things;
};


Controller.subclass = function(object) {
  var f = function() {
    Controller.apply(this, arguments);
  };
  util.inherits(f, Controller);
  for (var k in object) {
    f.prototype[k] = object[k];
  }
  return f;
};


Controller.prototype.toJSON = function() {
  return {'message': 'I am a controller!'};
};


return Controller;