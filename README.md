FX-Intercept
============

Introduction
------------

FX-Intercept is a Firefox addon which makes it easier to configure and use
your intercepting proxy of choice. It was originally written with [OWASP
ZAP](https://www.owasp.org/index.php/OWASP_Zed_Attack_Proxy_Project) in mind
but, since we believe in choice at Mozilla, it's easy to make use of this with
Burp and probably other similar tools too.

Instructions
------------
1. Install the addon. I'll put it up on AMO soon but you'll always be able
   to get the latest version
   [here](https://github.com/mozmark/Mitm-Tool/blob/master/fx-intercept.xpi).
2. Browse to your tool's configuration page. If you have ZAP with the MiTM
   extension, you can do that by browsing to <http://localhost:8080/mitm>.
   You can set up any number of configurations for different tools and switch
   between them.
3. Use your intercepting proxy as you normally would. FX-Intercept comes
   with two useful gcli command for security testing with ZAP; intercept
   (for intercepting requests and responses) and record (for use with the
   ZAP Zest extension).

Should you wish to revert your intercepting proxy configuration, you can do
this with the 'mitm config clear' command. 'mitm config remove' allows you to
remove a configuration completely.

Integrating other tools:
------------------------
I've designed this to be easy to integrate support in other tools. I'll
write this up but, for now, you can see how the mitmconf ZAP addon (an alpha
ZAP extension).
