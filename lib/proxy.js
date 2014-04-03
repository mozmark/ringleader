/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Cc,Ci} = require("chrome");

var prefManager = Cc["@mozilla.org/preferences-service;1"]
  .getService(Ci.nsIPrefBranch);

var PROXY_NONE=0;
var PROXY_MANUAL=1;
var PROXY_AUTO=2;
var PROXY_DETECT=4;
var PROXY_SYSTEM=5;

/*
 * Representation of a host and port; used in ProxyConfig for the proxies
 * configured for each protocol.
 */
function HostPort(host, port) {
  this.host = host;
  this.port = parseInt(port,10);
  this.toString = function() {
    return this.host+':'+this.port;
  };
}

HostPort.fromPrefs = function(hostpref, portpref) {
  var host = prefManager.getCharPref(hostpref);
  var port = prefManager.getIntPref(portpref);
  if(host && port) {
    if(host.length > 0 && parseInt(port) > 0) {
      return new HostPort(host,port);
    }
  }
  return null;
}

HostPort.fromString = function(endpoint) {
  var parts = endpoint.split(':');
  if (2 == parts.length) {
    var host = parts[0];
    var port = parseInt(parts[1]);
    if (!isNaN(port)) {
     return new HostPort(host, port);
    }
    return null;
  }
  return null;
}

/*
 * A proxy configuration. Stores the type of proxy configuration (automatic,
 * manual, configured from PAC file, etc. as well as the configuration
 * information.
 */
function ProxyConfig() {
}

ProxyConfig.prototype= {
  type:PROXY_NONE,
};

ProxyConfig.prototype.toString = function() {
  return JSON.stringify(this);
}

/*
 * Some built in proxy configs.
 */
var BuiltIn = {
  'system':{"type":5,"socksVersion":5,"proxyExcludes":"localhost, 127.0.0.1"},
  'none':{"type":0,"socksVersion":5,"proxyExcludes":"localhost, 127.0.0.1"},
  'detect':{"type":4,"socksVersion":5,"proxyExcludes":"localhost, 127.0.0.1"},
};

/*
 * Many proxy configs.
 */
var ProxyManager = {
  /**
   * Apply a shared config.
   * endpoint - the endpoint to configure for shared config (e.g. 'host:port')
   * excludes - comma separated string of hosts to exclude
   * name - (optional) the name to give this configuration (if the config is to
   * be saved).
   */
  applySharedConfig:function(endpoint, excludes, name) {
    var config = this.sharedProxy(endpoint, excludes);
    if (name) {
      proxyStore.store(name, config);
    }
    this.applyConfig(config);
    return 'ok';
  },

  /**
   * Apply an auto (PAC) config.
   * URL - the URL of the PAC
   * name - (optional) the name to give this configuration (if the config is to
   * be saved).
   */
  applyAutoConfig:function(URL, name) {
    var config = ProxyManager.autoProxy(URL);
    if (name) {
      proxyStore.store(name, config);
    }
    ProxyManager.applyConfig(config);
    return 'ok';
  },

  /**
   * Apply a named config.
   * name - the name of the config to apply.
   */
  applyNamedConfig:function(name) {
    var config = this.get(name);
    if (config) {
      ProxyManager.applyConfig(config);
      return 'ok';
    }
    return 'no config with this name';
  },

  /**
   * Apply a manual config.
   * http - the endpoint for the HTTP proxy
   * ssl - the endpoint for the SSL proxy
   * ftp - the endpoint for the FTP proxy
   * socks - the endpoint for the socks proxy
   * excludes - comma separated string of hosts to exclude
   */
  applyManualConfig:function(http, ssl, ftp, socks, excludes, name){
    var config = ProxyManager.manualProxy(http, ssl, ftp, socks, excludes);
    if (name) {
      proxyStore.store(name, config);
    }
    ProxyManager.applyConfig(config);
    return 'ok';
  },

  /**
   * Add the current configuration.
   * name - the name to give this configuration.
   */
  addCurrent:function(name) {
    var current = ProxyManager.readConfigFromPreferences();
    proxyStore.store(name, current);
    return 'ok, I think';
  },

  /**
   * Delete a proxy configuration.
   * name - the name of the proxy configuration to delete.
   */
  deleteConfig:function(name) {
    if (name && 'default' == name) {
      return 'you cannot delete the default profile';
    }
    proxyStore.remove(name);
    return 'deleted';
  },

  /**
   * List the proxy configurations.
   * returns an array of proxy config names.
   */
  list:function() {
    var list = proxyStore.list();
    // TODO: replace with a list of 'special' names
    list.push('default');
    for(key in BuiltIn) {
      list.push(key);
    }
    return list;
  },

  /**
   * Get a proxy configuration.
   * name - the name of the proxy configuration to get.
   */
  get:function(name) {
    if ('default' == name) {
      return ProxyManager.readConfigFromPreferences();
    }
    var config =  proxyStore.fetch(name);
    if (!config) {
      config = BuiltIn[name];
      if (config) {
        config.__proto__ = ProxyConfig.prototype;
      }
    }
    return config;
  },

  /*
   * Read a proxy config from firefox preferences.
   */
  readConfigFromPreferences:function() {
    var config = new ProxyConfig();
    config.type = prefManager.getIntPref('network.proxy.type');
    var http = HostPort.fromPrefs('network.proxy.http','network.proxy.http_port');
    if (http) {
      config.http = http;
    }
    var ssl = HostPort.fromPrefs('network.proxy.ssl','network.proxy.ssl_port');
    if (ssl) {
      config.ssl = ssl;
    }
    var ftp = HostPort.fromPrefs('network.proxy.ftp','network.proxy.ftp_port');
    if (ftp) {
      config.ftp = ftp;
    }
    var socks = HostPort.fromPrefs('network.proxy.socks','network.proxy.socks_port');
    if (socks) {
      config.socks = socks;
    }
    var shareSettings = prefManager.getBoolPref('network.proxy.share_proxy_settings');
    if (shareSettings) {
      config.shareSettings = shareSettings;
    }
    var socksVersion = prefManager.getIntPref('network.proxy.socks_version');
    if (socksVersion) {
      config.socksVersion = socksVersion;
    }
    var proxyExcludes = prefManager.getCharPref('network.proxy.no_proxies_on');
    if (proxyExcludes) {
      config.proxyExcludes = proxyExcludes;
    }
    var autoConfigURL = prefManager.getCharPref('network.proxy.autoconfig_url');
    if (autoConfigURL) {
      config.autoConfigURL = autoConfigURL;
    }
    return config;
  },

  manualProxy:function(http, ssl, ftp, socks, excludes) {
    var config = new ProxyConfig();
    config.http = new HostPort.fromString(http);
    config.ssl = new HostPort.fromString(ssl);
    config.ftp = new HostPort.fromString(ftp);
    config.socks = new HostPort.fromString(socks);
    config.excludes = excludes;
    return config;
  },

  /*
   * Create a shared proxy configuration (e.g. localhost:8080 for all protocols.
   */
  sharedProxy:function(endpointString, excludes) {
    var config = new ProxyConfig();
    config.type = PROXY_MANUAL;
    config.shareSettings = true;
    config.http = new HostPort.fromString(endpointString);
    config.ssl = new HostPort.fromString(endpointString);
    config.ftp = new HostPort.fromString(endpointString);
    config.socks = new HostPort.fromString(endpointString);
    config.proxyExcludes = excludes;
    return config;
  },

  /*
   * Create a proxy config for a PAC configuration.
   */
  autoProxy:function(pacURL) {
    var config = new ProxyConfig();
    config.type = PROXY_AUTO;
    config.autoConfigURL = pacURL;
    return config;
  },

  /**
   * Apply a supplied config to the firefox preferences.
   */
  applyConfig:function(config) {
    if(!config) {
      return;
    }
    // TODO: Do we need to back up the existing prefs to the
    // network.proxy.backup prefs at all? Check FX source for when this happens
    // and if we need to imitate this at all.
    if (!this.get('original')) {
      this.addCurrent('original');
    }
    this.addCurrent('undo');
    if (config.type) {
      prefManager.setIntPref('network.proxy.type',config.type);
    }
    if (config.http) {
      prefManager.setCharPref('network.proxy.http',config.http.host);
      prefManager.setIntPref('network.proxy.http_port',config.http.port);
    }
    if (config.ftp) {
      prefManager.setCharPref('network.proxy.ftp',config.ftp.host);
      prefManager.setIntPref('network.proxy.ftp_port',config.ftp.port);
    }
    if (config.ssl) {
      prefManager.setCharPref('network.proxy.ssl',config.ssl.host);
      prefManager.setIntPref('network.proxy.ssl_port',config.ssl.port);
    }
    if (config.socks) {
      prefManager.setCharPref('network.proxy.socks',config.socks.host);
      prefManager.setIntPref('network.proxy.socks_port',config.socks.port);
    }
    if (config.shareSettings) {
      prefManager.setBoolPref('network.proxy.share_proxy_settings',
          config.shareSettings);
    }
    if (config.socksVersion) {
      prefManager.setIntPref('network.proxy.socks_version',
          config.socksVersion);
    }
    if (config.proxyExcludes) {
      prefManager.setCharPref('network.proxy.no_proxies_on',
          config.proxyExcludes);
    }
    if (config.autoConfigURL) {
      prefManager.setCharPref('network.proxy.autoconfig_url',
          config.autoConfigURL);
    }
  }
};

function ProxyStore() {
  this.ss = require("sdk/simple-storage");
  if(!this.ss.storage.profiles) {
    this.ss.storage.profiles = [];
  }
}

ProxyStore.prototype = {
  store:function(name, data) {
    this.ss.storage.profiles[name] = JSON.stringify(data);
  },
  fetch:function(name) {
    var data = this.ss.storage.profiles[name];
    if (data) {
      var obj = JSON.parse(data);
      obj.__proto__ = ProxyConfig.prototype;
      return obj;
    }
    return null;
  },
  remove:function(name) {
    delete this.ss.storage.profiles[name];
  },
  list:function() {
    var profiles = [];
    for(profile in this.ss.storage.profiles) {
      profiles[profiles.length] = profile;
    }
    return profiles;
  }
};

proxyStore = new ProxyStore();

exports.ProxyConfig = ProxyConfig;
exports.ProxyManager = ProxyManager;
