var Controller = skit.platform.Controller;
var navigation = skit.platform.navigation;
return Controller.create({
  __preload__: function(loaded) {
    // TODO(Taylor): Add real API reference somewhere.
    navigation.navigate('https://github.com/clusterinc/skit/');
    loaded();
  }
})