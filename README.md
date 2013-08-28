FxPnH
=====

Introduction
------------

FxPnH is a Firefox addon which makes it possible to use Firefox with
Plug-n-Hack providers.

Instructions
------------
1. Install the addon. I'll put it up on AMO soon but you'll always be able
   to get the latest version
   [here](https://github.com/mozmark/ringleader/blob/master/fx_pnh.xpi).
2. Browse to your tool's configuration page. If you have ZAP with the
   Plug-n-Hack extension, you can do that by browsing to
   <http://localhost:8080/mitm>. You can set up any number of configurations
   for different tools and switch between them.
3. Use your PnH provider.

You can switch between configurations (or clear them completely) using the
*pnh config* command.

Should you wish to revert your intercepting proxy configuration, you can do
this with the *pnh config clear* command. *png config remove* allows you to
remove a configuration completely.

Integrating your tools:
------------------------
I've designed this to be easy to integrate support in other tools; documentation is in progress [here](https://github.com/mozmark/ringleader/blob/master/doc/main.md). You can also look to see how the Plug-n-Hack ZAP addon works.
