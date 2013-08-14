Creating a Provider
-------------------

Providers must make the following available to allow configuration:
* A web page, similar to the [provider sample](https://github.com/mozmark/Mitm-Tool/blob/master/doc/provider_sample.html), which:
  * Tells the user about the tool
  * Fires a user-initiated ConfigureSecProxy event (e.g. on a button click) containing the URL of the tool manifest (see below)
  * Listens for ConfigureSecProxyStarted, ConfigureSecProxyFailed, ConfigureSecProxyActivated and ConfigureSecProxySucceeded events and notifies the user appropriately.
* A tool manifest, sample to follow, which provides information about the tool (what features are supported, the tool name, etc).

Supported Features
------------------

Three security tool features are currently supported:

1. Proxies
2. Configuration of a Certificate Authority (e.g. for intercepting proxies)
3. Command registration - tools can provide descriptors ([see documentation](service_commands.md)) which allow REST APIs to be invoked from the browser

Using the addon
---------------

The addon currently targets Firefox 24; it can be installed and run in earlier versions though some commands may not work properly thanks to some GCLI issues which have been resolved in Fx24.

Obviously, it's possible to just [download the XPI](https://github.com/mozmark/ringleader/raw/master/ringleader.xpi) and run this, though I currently recommend you run this in it's own profile as this isn't (yet) production quality.

If you're working on integrating a tool, you'll probably find it most useful to run this using the [Add-on SDK](https://addons.mozilla.org/en-US/developers/docs/sdk/latest/dev-guide/index.html) for two reasons: Firstly, addons can write information to the console if invoked using the sdk. Secondly, you can automatically set some prefs that are useful when you're testing with descriptors or content served from a different origin to the API endpoints provided by your tool (by default, Ringleader expects tools to serve descriptors, etc. from the same origin that's used for the API).

Your command to run the tool might look like this:

```
cfx run -b /path/to/nightly/firefox --binary-args http://localhost:3000/static/config --static-args="{ \"prefs\": { \"ringleader.check.origin\": \"off\" } }"
```
