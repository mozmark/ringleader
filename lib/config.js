/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc, Ci} = require("chrome");
const base64 = require("sdk/base64");
const data = require("sdk/self").data;
const events = require("sdk/system/events");
const Promise = require('sdk/core/promise');
const {readURI} = require("sdk/net/url");
const storage = require("simple-storage");
const { emit } = require("sdk/event/core");
const { EventTarget } = require("sdk/event/target");
const { Class } = require("sdk/core/heritage");
const { merge } = require("sdk/util/object");

const nsX509CertDB = "@mozilla.org/security/x509certdb;1";
const nsIX509Cert = Ci.nsIX509Cert;
const nsIX509CertDB = Ci.nsIX509CertDB;
const certdb = Cc[nsX509CertDB].getService(nsIX509CertDB);
const wMediator = Cc["@mozilla.org/appshell/window-mediator;1"]
        .getService(Ci.nsIWindowMediator);

const {ProxyConfig, ProxyManager, HostPort} = require("./proxy");
const {ServiceStub} = require("./servicestub");
const {MITM} = require("./mitm");
const {Utils} = require("./secutils");

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
      let config = this.fetchConfig(storage.storage.current);
      if (config) {
        let proxyConfig = JSON.parse(storage.storage.originalConfig);
        // remove the cert
        let cert = certdb.constructX509FromBase64(config.cert.base64);
        try {
          // TODO: work out how to chek if the cert exists prior to removal
          if (certdb.isCertTrusted(cert,nsIX509Cert.CA_CERT,nsIX509CertDB.TRUSTED_SSL)) {
            certdb.deleteCertificate(cert);
          }
        } catch (e) {
          console.log(e);
        }
        // apply the original proxy config
        ProxyManager.applyConfig(proxyConfig);
        delete storage.storage.current;
        if (!suppress) {
          emit(this,'MitmConfigChanged',null);
        }
      } else {
        console.log('there was no config to remove');
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
      let config = this.fetchConfig(name);
      if (config && config.manifest.features.proxy) {
        let pac = config.manifest.features.proxy.PAC;
        if (pac && config.url && Utils.CheckOrigin(config.url,pac)) {
          // configure from the proxy supplied PAC
          storage.storage.originalConfig
              = JSON.stringify(ProxyManager.get('default'));
          ProxyManager.applyAutoConfig(pac);
        } else if (pac) {
          console.log("Proxy PAC is off origin");
          throw new Error('Proxy PAC is off origin - configuration failed');
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
      let data =  storage.storage.configs[name];
      if (data) {
        let config = new Configuration(JSON.parse(data));
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

var setup = function() {
  function dispatchSetupEvent(doc, kind, data){
    let evt = doc.createEvent('CustomEvent');
    evt.initCustomEvent(kind,true,false,data);
    doc.dispatchEvent(evt);
  }

  // register the custom event listener to allow proxies to be registered:
  function handleSetup(event){
    // Send ConfigureSecProxyStarted event
    let doc = event.originalTarget;
    dispatchSetupEvent(doc, 'ConfigureSecProxyStarted',{});

    let mainWindow = wMediator.getMostRecentWindow("navigator:browser");
    let domWindowUtils = mainWindow.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindowUtils);
    if (domWindowUtils.isHandlingUserInput) {
      Setup.configure(event.detail.url).then(
          function(configInfo) {
            //TODO: send ConfigureSecProxySucceeded event
            dispatchSetupEvent(doc, 'ConfigureSecProxySucceeded',{});
          },
          function(errorInfo){
            //TODO: send ConfigureSecProxyFailed event
            dispatchSetupEvent(doc, 'ConfigureSecProxyFailed',{});
          });
    } else {
      // do we want to record this somewhere - could be malicious?
    }
  }

  function recover(){
    var currentConfigName = configManager.currentConfig();
    if (currentConfigName) {
      // attempt to load any commands
      var currentConfig = configManager.fetchConfig(currentConfigName);
      console.log('current config looks like this: '+JSON.stringify(currentConfig));
      if (currentConfig && currentConfig.manifest && currentConfig.manifest.features) {
        var features = currentConfig.manifest.features;
        if (features.commands) {
          // TODO: Look into providing a tidier interface for a config that
          // includes service stub loading, etc.
          console.log('adding service stub');
          var stub = new ServiceStub(features.commands.manifest, features.commands.prefix, MITM.callback.bind(MITM));
          console.log('added');
          stub.hook();
        }
      }
    }
  }

  var doSetup = function () {
    let succeeded = false;
    return function () {
      // don't bother if we've already run
      if (!succeeded) {
        let mainWindow = wMediator.getMostRecentWindow("navigator:browser");
        mainWindow.gBrowser
            .addEventListener('ConfigureSecProxy',handleSetup,true,true);
        // if there are profiles already applied, let's load commands, etc.
        recover();
        succeeded = true;
      }
    };
  }();

  try {
    // try to setup - this may fail if there is no window present yet
    doSetup();
  } catch (e) {
    // try setup again - once we have a content document global
    events.once("content-document-global-created", function(event) {
      doSetup();
    });
  }

  // fire an 'activated' event on the current document:
  let recentWindow = wMediator.getMostRecentWindow("navigator:browser");
  if (recentWindow && recentWindow.content && recentWindow.content.document) {
    dispatchSetupEvent(recentWindow.content.document, 'ConfigureSecProxyActivated', {});
  }
};

/**
 * A setup helper object
 */
var Setup = {
};

Setup.userConfirm = function() {
  // return a promise with user choice.
  let deferred = Promise.defer();
  let panel = require("sdk/panel").Panel({
    width: 640,
    height: 240,
    contentURL: data.url("warning.html"),
    contentScriptFile: data.url("warning.js")
  });
  panel.on('hide',function(event) {deferred.reject(event);});
  panel.port.on('confirm',function(event) {deferred.resolve(event);panel.hide();});
  panel.port.on('cancel',function(event) {panel.hide();});
  // resolve the promise in a message handler from the script, or something
  panel.show();
  return deferred.promise;
};

Setup.configure = function(url) {
  return Configuration.fromURL(url).then(function(config) {
    let name = config.manifest.toolName;
    // ensure no other config exists with this name
    // TODO: asking the user might be nice
    if (configManager.currentConfig()) {
      configManager.clear();
    }
    if(configManager.list().indexOf(name) >= 0){
      configManager.deleteConfig(name);
    }
    // save and apply the config
    configManager.saveConfig(config, name);
    configManager.applyConfig(name);
    // TODO: add config data to allow the provider to display details
    return 'ok';
  }, function(error) {
    //TODO: provide more useful information on what failed.
    return 'Setup failed';
  });
};

function Configuration(data) {
  if (data) {
    for(key in data) {
      this[key] = data[key];
    }
  }
}

Configuration.fromURL = function(url) {
  let config = new Configuration();
  config.url = url;
  return readURI(url).then(function(data) {
    let manifest = JSON.parse(data);
    // TODO: Send some info on the proxy to userConfirm
    return Setup.userConfirm().then(function () {
      if (manifest.features.commands) {
        let commands = manifest.features.commands;
        if (commands.prefix && commands.manifest) {
          console.log('adding service stub');
          console.log(Utils.CheckOrigin(url, commands.manifest));
          var stub = new ServiceStub(commands.manifest, commands.prefix, MITM.callback.bind(MITM));
          console.log('added');
          stub.hook();
        }
      }
      if (manifest.features.proxy && manifest.features.proxy.CACert) {
        // fetch and install the CA cert
        let certURL = manifest.features.proxy.CACert;
        if (certURL && Utils.CheckOrigin(url, certURL)) {
          // fetch data from the URL.
          // TODO: the success of this promise shouldn't depend on an optional
          // attribute being read successfully.
          return readURI(certURL).then(function(data){
            // split off the header and footer, base64 decode
            let b64 = data.split('-----')[2].replace(/\s/g, '');
            let der = base64.decode(b64);

            let cert = certdb.constructX509FromBase64(b64);

            // import the cert with appropriate trust bits.
            config.manifest = manifest;
            config.cert = {"der":der,"base64":b64};

            return config;
          });
        } else {
          throw new Error('CA Cert is off origin. Configuration failed.');
        }
      }
    }, function(error) {
      // Do not fail silently; user needs to know
      return error;
    });
  });
};

exports.setup = setup;
exports.configManager = configManager;
