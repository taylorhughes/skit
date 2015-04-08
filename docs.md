Skit API reference
------------------

Welcome to the skit API reference. These modules are available inside skit apps as "skit.browser.dom", "skit.platform.iter", etc, like so:

    var net = skit.platform.net;
    var Controller = skit.

    module.exports = Controller.create()
    net.send('https://your-site.com/api/foo', {
      success: function(response) {
        // check response.code, etc.
      }
    );

These modules are meant to work in all browsers back to IE7-ish.

Skit modules
------------

Skit modules are collections of files with the same filename before the first "_". For example, these files in a directory:

- <code>Foo.html</code>
- <code>Foo.js</code>
- <code>Foo_Bar.js</code>
- <code>Foo_bazbuz.js</code>
- <code>Foo.css</code>

Provide a single module, "Foo", with several internal modules. In Foo.js, you might import some of them at the top of your file:

    // This is a global skit library.
    var net = skit.platform.net;

    // This is a class from another skit module we wrote.
    var MyLibraryClass = library.things.MyLibraryClass;

    var Bar = __module__.Bar;
    // This is a Handlebars compiled template.
    var html = __module__.html;

CSS modules are not accessible this way:

    // this will not work:
    var css = __module__.css;


Module conventions
------------------

1. Files whose exports are a class are <code>CapitalizedLikeAClass</code>, eg. <code>Controller.js</code>
2. Files whose exports are a module <code>arelikethis</code> -- no spaces
3. Internal modules, eg. <code>SomeModule_someinternalthing.js</code> follow the same convention -- "someinternalthing" in this case is not a class, whereas <code>SomeModule_InternalThing.js</code> is a class
4. <code>__things_like_this__</code> are generally _special_ skit API things.
5. Imports are grouped: first global, then project, then internal imports.
6. Imports can only be at the top of the file -- imports below the first non-import are ignored.


skit.browser
------------

The browser module contains things that depend on "window", eg. client-side event listeners, DOM lookups and DOM layout measuring functionality.

skit.platform
-------------

The platform module is intended for use in both places: server and client-side. It contains several modules that work transparently on the server and in the browser:

- *cookies* - Wraps cookie setting/reading.
- *net* - Wraps XHR on the client and _request_ on the server to provide the ability to call HTTP endpoints from either place transparently.
- *navigation* - Provides information about the current URL globally, and allows the server side to perform redirects using navigation.navigate() and issue 404s with navigation.notFound().

