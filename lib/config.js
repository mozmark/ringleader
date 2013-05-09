/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc, Ci} = require("chrome");
var base64 = require("sdk/base64");
var data = require("sdk/self").data;
var events = require("sdk/system/events");
var Promise = require('sdk/core/promise');
const {readURI} = require("sdk/net/url");
var storage = require("simple-storage");
var { emit } = require("sdk/event/core");
var { EventTarget } = require("sdk/event/target");
var { Class } = require("sdk/core/heritage");
var { merge } = require("sdk/util/object");

const nsX509CertDB = "@mozilla.org/security/x509certdb;1";
const nsIX509Cert = Ci.nsIX509Cert;
const nsIX509CertDB = Ci.nsIX509CertDB;
certdb = Cc[nsX509CertDB].getService(nsIX509CertDB);

const {ProxyConfig, ProxyManager, HostPort} = require("./proxy");

console.log('config...');

var setup = function() {
  var dispatchSetupEvent = function(doc, kind, data){
    var evt = doc.createEvent('CustomEvent');
    evt.initCustomEvent(kind,true,false,data);
    doc.dispatchEvent(evt);
  };

  // register the custom event listener to allow proxies to be registered:
  var handleSetup = function(event){
    // Send ConfigureSecProxyStarted event
    var doc = event.originalTarget;
    dispatchSetupEvent(doc, 'ConfigureSecProxyStarted',{});

    var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
        .getService(Ci.nsIWindowMediator);
    var mainWindow = wm.getMostRecentWindow("navigator:browser");
    let domWindowUtils = mainWindow.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindowUtils);
    if (domWindowUtils.isHandlingUserInput) {
      Setup.configure(event.detail.url).then(
          function(configInfo) {
            console.log('config succeeded');
            //TODO: send ConfigureSecProxySucceeded event
            dispatchSetupEvent(doc, 'ConfigureSecProxySucceeded',{});
          },
          function(errorInfo){
            console.log('config failed');
            //TODO: send ConfigureSecProxyFailed event
            dispatchSetupEvent(doc, 'ConfigureSecProxyFailed',{});
          });
    } else {
      // do we want to record this somewhere - could be malicious?
      console.log('ConfigureSecProxy events are only allowed from user input');
    }
  };

  var registerConfigureListener = function () {
    var succeeded = false;
    return function () {
      if (!succeeded) {
        console.log('registering config listener');
        var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
            .getService(Ci.nsIWindowMediator);
        var mainWindow = wm.getMostRecentWindow("navigator:browser");
        mainWindow.gBrowser
            .addEventListener('ConfigureSecProxy',handleSetup,true,true);
        succeeded = true;
      }
    };
  }();

  try {
    registerConfigureListener();
  } catch (e) {
    events.once("content-document-global-created", function(event) {
      registerConfigureListener();
    });
  }

  // fire an 'activated' event on the current document:
  var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
      .getService(Ci.nsIWindowMediator);
  var recentWindow = wm.getMostRecentWindow("navigator:browser");
  if (recentWindow && recentWindow.content && recentWindow.content.document) {
    dispatchSetupEvent(recentWindow.content.document, 'ConfigureSecProxyActivated', {});
  }
  console.log('setup');
};

/**
 * ConfigManager - manage man-in-the-middle proxy configurations.
 */
var ConfigManager = Class({
  extends: EventTarget,
    initialize: function initialize(options) {
      EventTarget.prototype.initialize.call(this, options);
      merge(this, options);
      if (!storage.storage.configs) {
        storage.storage.configs = {};
      }
    },

    /**
     * List the available configurations.
     * returns: a list of strings of configuration names.
     */
    list : function list() {
      return Object.keys(storage.storage.configs);
    },

    /**
     * Get the current config name.
     * returns: a string of the current config name.
     */
    currentConfig : function currentConfig() {
      return storage.storage.current;
    },

    /**
     * Clear the applied config:
     * suppress - should MitmConfigChanged events be suppressed for this
     * configuration change.
     */
    clear : function clear(suppress) {
      // get the name of the cert and the saved proxy config
      var config = this.fetchConfig(storage.storage.current);
      if (config) {
        var proxyConfig = JSON.parse(storage.storage.originalConfig);
        // remove the cert
        var cert;
        var cert = certdb.constructX509FromBase64(config.cert.base64);
        certdb.deleteCertificate(cert);
        // apply the original proxy config
        ProxyManager.applyConfig(proxyConfig);
        delete storage.storage.current;
        if (!suppress) {
          emit(this,'MitmConfigChanged',null);
        }
      } else {
        throw new Error('cannot clear: there is no configuration currently applied');
      }
    },

    /**
     * Save a configuration.
     * config - the config to save.
     * name - the name to save the config with.
     */
    saveConfig : function saveConfig(config, name) {
      if (name === storage.storage.current) {
        throw new Error('cannot modify a currently used config');
      } else {
        storage.storage.configs[name] = JSON.stringify(config);
      }
    },

    /**
     * Apply a configuration.
     * name - the name of the configuration to apply.
     */
    applyConfig : function applyConfig(name) {
      if (storage.storage.current) {
        this.clear(true);
      }
      var config = this.fetchConfig(name);
      if (config) {
        if (config.manifest.proxyPAC) {
          // configure from the proxy supplied PAC
          storage.storage.originalConfig
              = JSON.stringify(ProxyManager.get('default'));
          ProxyManager.applyAutoConfig(config.manifest.proxyPAC);
        }
        if (config.cert && config.cert.der && config.cert.base64) {
          certdb.addCert(config.cert.der,'Cu,,','NSS ignores nicknames');
        }
        storage.storage.current = name;
        emit(this,'MitmConfigChanged',config);
      }
    },

    /**
     * Delete a configuration.
     * name - the name of the configuration to delete.
     */
    deleteConfig : function deleteConfig(name) {
      if (name === storage.storage.current) {
        throw new Error('cannot remove configuration: currently in use');
      } else {
        delete storage.storage.configs[name];
      }
    },

    /**
     * Fetch a configuration from storage.
     * name - the name of the configuration to fetch.
     * returns: a Configuration
     */
    fetchConfig : function fetchConfig(name) {
      var data =  storage.storage.configs[name];
      if (data) {
        var config = new Configuration(JSON.parse(data));
        return config;
      }
      return null;
    },

    /**
     * Get the name of the current config.
     * returns: the name of the current configuration.
     */
    currentConfig : function currentConfig() {
      return storage.storage.current;
    },
});

var configManager = new ConfigManager();

/**
 * A setup helper object
 */
var Setup = {
};

Setup.userConfirm = function() {
  // return a promise with user choice.
  var deferred = Promise.defer();
  var panel = require("sdk/panel").Panel({
    width: 640,
    height: 240,
    contentURL: data.url("warning.html"),
    contentScriptFile: data.url("warning.js")
  });
  panel.on('hide',function(event) {console.log('panel hidden'); deferred.reject(event);});
  panel.port.on('confirm',function(event) {deferred.resolve(event);panel.hide();});
  panel.port.on('cancel',function(event) {panel.hide();});
  // resolve the promise in a message handler from the script, or something
  panel.show();
  return deferred.promise;
};

Setup.configure = function(url) {
  return Configuration.fromURL(url).then(function(config) {
    var name = config.manifest.mitmTool;
    console.log('name is '+name);
    configManager.saveConfig(config, name);
    configManager.applyConfig(name);
    // TODO: add config data to allow the provider to display details
    return 'ok';
  }, function(error) {
    //TODO: provide more useful information on what failed.
    return 'Setup failed';
  });
};

var Configuration = function (data) {
  if (data) {
    for(key in data) {
      this[key] = data[key];
    }
  }
};

Configuration.fromURL = function(url) {
  var config = new Configuration();
  var deferred = Promise.defer();
  readURI(url).then(function(data) {
    var manifest = JSON.parse(data);
    console.log('got manifest');
    // TODO: Send some info on the proxy to userConfirm
    Setup.userConfirm().then(function () {
      if(manifest.features.CACert) {
        // fetch and install the CA cert
        var certURL = manifest.features.CACert;
        console.log('attempting to read CACert');
        // fetch data from the URL.
        readURI(certURL).then(function(data){
          try {
            console.log('got cert data');
            // split off the header and footer, base64 decode
            console.log('getting cert');
            var b64 = data.split('-----')[2].replace(/\s/g, '');
            var der = base64.decode(b64);
            try {
              var cert = certdb.constructX509FromBase64(b64);
            } catch (e) {
              // TODO: This is most likely to be because the cert is already
              // installed - do get this state to the user or would it be OK
              // to continue? Need to test when (and why) failure happens. Also,
              // maybe check to see if the cert exists first?
              deferred.reject(e);
            }
            console.log('got cert');
            // import the cert with appropriate trust bits.
            config.manifest = manifest;
            config.cert = {"der":der,"base64":b64};
            deferred.resolve(config);
          } catch (e) {
            console.log('something broke when getting cert data: '+e);
            deferred.reject(e);
          }
          deferred.resolve(config);
        }, function(error) {
          console.log('something broke');
          deferred.reject(error);
        });
      }
    }, function () {
      console.log('user did not confirm...');
      deferred.reject();
    });
  }, function(error) {
    console.log('something broke');
    deferred.reject(error);
  });
  return deferred.promise;
};

exports.setup = setup;
exports.configManager = configManager;
