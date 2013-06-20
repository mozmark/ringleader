Creating a Provider
===================

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
3. Command registration - tools can provide descriptors which allow REST APIs to be invoked from the browser

