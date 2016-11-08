/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc, Ci} = require("chrome");
const base64 = require("sdk/base64");
const data = require("sdk/self").data;
const tabs = require("sdk/tabs");
const self = require("sdk/self");
const events = require("sdk/system/events");
const promise = require('sdk/core/promise');
const {readURI} = require("sdk/net/url");
const {XMLHttpRequest} = require("sdk/net/xhr");
const storage = require("sdk/simple-storage");
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

const EVENT_ACTIVATED = "ConfigureSecToolActivated";
const EVENT_STARTED = "ConfigureSecToolStarted";
const EVENT_SUCCEEDED = "ConfigureSecToolSucceeded";
const EVENT_FAILED = "ConfigureSecToolFailed";
const EVENT_CONFIGURE = "ConfigureSecTool";
const EVENT_CONFIG_CHANGED = "PnHConfigChanged";

const ERROR_ALREADY_CONFIGURED = "A provider with this name has already been configured.";

const SUPPORTED_PROTOCOL = 1.0;

/**
 * ConfigManager - manage security tool configurations.
 */
var ConfigManager = Class({
  extends: EventTarget,
    initialize: function initialize(options) {
      EventTarget.prototype.initialize.call(this, options);
      merge(this, options);
      if (!storage.storage.configs) {
        storage.storage.configs = {};
      }
      if (!storage.storage.currentConfigs) {
        storage.storage.currentConfigs = [];
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
     * Get the current config names.
     * returns: an array of strings of the current config names.
     */
    currentConfigs: function currentConfigs() {
      return storage.storage.currentConfigs;
    },

    /**
     * Clear the applied config:
     * suppress - should EVENT_CONFIG_CHANGED be suppressed for this?
     * configuration change.
     */
    clear : function clear(suppress, configName) {
      let configs = storage.storage.currentConfigs;

      names = [];

      if (configName) {
        names.push(configName);
      } else {
        names = names.concat(storage.storage.currentConfigs);
      }

      console.log("names are "+JSON.stringify(names));

      for (name of names) {
        if ((name && configs.indexOf(name) >= 0) || !name) {
          // TODO: deal with clear with no name
          let config = this.fetchConfig(name);
          if (config && config.manifest && config.manifest.features['proxy']) {
            // get the name of the cert and the saved proxy config
            let proxyConfig = JSON.parse(storage.storage.originalConfig);
            // remove the cert
            if (config.manifest.features.proxy.CACert) {
              let cert = certdb.constructX509FromBase64(config.cert.base64);
              try {
                // TODO: work out how to chek if the cert exists prior to removal
                if (certdb.isCertTrusted(cert,nsIX509Cert.CA_CERT,nsIX509CertDB.TRUSTED_SSL)) {
                  certdb.deleteCertificate(cert);
                }
              } catch (e) {
                console.log(e);
              }
            }
            // apply the original proxy config
            ProxyManager.applyConfig(proxyConfig);
            if (!suppress) {
              emit(this, EVENT_CONFIG_CHANGED, null);
              let newConfigs = [];
              for (let idx in storage.storage.currentConfigs) {
                let configName = storage.storage.currentConfigs[idx];
                if (name!=configName) {
                  newConfigs.push(configName);
                }
              }
              storage.storage.currentConfigs = newConfigs;
            }
          } else {
            let newConfigs = [];
            for (let idx in storage.storage.currentConfigs) {
              let configName = storage.storage.currentConfigs[idx];
              if (name!=configName) {
                newConfigs.push(configName);
              }
            }
            storage.storage.currentConfigs = newConfigs;
          }
        }
        else {
          console.log('there was no config to remove');
          throw new Error('cannot clear: there is no configuration currently applied');
        }
      }
    },

    /**
     * Save a configuration.
     * config - the config to save.
     * name - the name to save the config with.
     */
    saveConfig : function saveConfig(config, name) {
      let existing = this.fetchConfig(name);
      if (existing) {
        throw new Error(ERROR_ALREADY_CONFIGURED);
      } else {
        if (storage.storage.currentConfigs.indexOf(name) >= 0) {
          throw new Error('cannot modify a currently used config');
        } else {
          storage.storage.configs[name] = JSON.stringify(config);
        }
      }
    },

    /**
     * Check a config is compatible with applied configs
     */
    ensureCompatible : function(config){
      if (config.manifest.features.proxy) {
        for (let idx in this.currentConfigs()) {
          let applied = this.fetchConfig(this.currentConfigs()[idx]);
          if (applied && applied.manifest.features.proxy) {
            throw new Error('You cannot apply two proxies concurrently');
          }
        }
      }
    },

    /**
     * Apply a configuration.
     * name - the name of the configuration to apply.
     */
    applyConfig : function applyConfig(name) {
      //if (storage.storage.current) {
      //  this.clear(true);
      //}
      let config = this.fetchConfig(name);
      if (config) {
        this.ensureCompatible(config);
        if (config.manifest && config.manifest.features && config.manifest.features.proxy) {
          let pac = config.manifest.features.proxy.PAC;
          if (pac && config.url && Utils.CheckOrigin(config.url,pac)) {
            // try to fetch the PAC before OKing
            readURI(pac).then(function(data) {
              // configure from the proxy supplied PAC
              storage.storage.originalConfig = JSON.stringify(ProxyManager.get('default'));
              ProxyManager.applyAutoConfig(pac);
              storage.storage.currentConfigs.push(name);
            }, function () {
              console.log('unable to read PAC');
              throw new Error("Unable to fetch PAC; refusing the apply config.");
            });
          } else if (pac) {
            console.log("Proxy PAC is off origin");
            throw new Error('Proxy PAC is off origin - configuration failed');
          }
          if (config.cert && config.cert.der && config.cert.base64) {
            certdb.addCert(config.cert.der,'Cu,,','NSS ignores nicknames');
          }
        } else {
          storage.storage.currentConfigs.push(name);
        }
        emit(this, EVENT_CONFIG_CHANGED, config);
      } else {
        throw new Error("No manifest found.");
      }
    },

    /**
     * Delete a configuration.
     * name - the name of the configuration to delete.
     */
    deleteConfig : function deleteConfig(name) {
      if (storage.storage.currentConfigs.indexOf(name) >= 0) {
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
});

var configManager = new ConfigManager();

var setup = function() {

  function dispatchSetupEvent(doc, kind, data){
    try {
      console.log("Event dispatched " + kind);
      let evt = doc.createEvent("CustomEvent");
      evt.initCustomEvent(kind, true, false, data);
      doc.dispatchEvent(evt);
      //self.port.emit(kind, data);
    } catch (e) {
      console.log("Oops!");
      console.log(e);
    }
  }

  // register the custom event listener to allow providers to be registered:
  function handleSetup(event){
    console.log('handling setup');
    // Send EVENT_STARTED event
    let doc = event.originalTarget;
    dispatchSetupEvent(doc, EVENT_STARTED, {});
    console.log('started event dispatched');

    let mainWindow = wMediator.getMostRecentWindow("navigator:browser");
    let domWindowUtils = mainWindow.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindowUtils);
    if (domWindowUtils.isHandlingUserInput) {
      Setup.configure(event.detail.url).then(
          function(configInfo) {
            //TODO: send EVENT_SUCCEEDED
            dispatchSetupEvent(doc, EVENT_SUCCEEDED, {"success":"Configuration succeeded."});
          },
          function(errorInfo){
            //TODO: send EVENT_FAILED
            dispatchSetupEvent(doc, EVENT_FAILED, JSON.stringify({"failure":errorInfo.message}));
          });
    } else {
      // do we want to record this somewhere - could be malicious?
    }
  }

  function recover(){
    console.log("RECOVER");
    for (currentIndex in configManager.currentConfigs()) {
      let currentConfigName = configManager.currentConfigs()[currentIndex];
      console.log('current config name '+currentConfigName);
      // attempt to load any commands
      var currentConfig = configManager.fetchConfig(currentConfigName);
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
        
        mainWindow.gBrowser.addEventListener(EVENT_CONFIGURE, handleSetup, true, true);

        // console.log("\n\nEXITING..\n\n");
        // worker.port.emit("GetDocument", {});
        // worker.port.on("RecieveDocument", function (doc) {
        // console.log("Received");
        // //doc.addEventListener(EVENT_CONFIGURE, handleSetup, true)
        // console.log(doc);
        // //console.log(document.getElementsByTagName('html')[0].innerHTML);
        // //console.log(typeof document);
        // //console.log(doc.documentElement.innerHTML);
        // });
        

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
    dispatchSetupEvent(recentWindow.content.document, EVENT_ACTIVATED, {});
  }
};

/**
 * A setup helper object
 */
var Setup = {
};

Setup.userConfirm = function(url) {
  // return a promise with user choice.
  let deferred = promise.defer();
  let panel = require("sdk/panel").Panel({
    width: 640,
    height: 270,
    contentURL: data.url("warning.html"),
    contentScriptFile: data.url("warning.js")
  });
  panel.on('hide',function(event) {deferred.reject(event);});
  panel.port.on('confirm',function(event) {deferred.resolve(event);panel.hide();});
  panel.port.on('cancel',function(event) {panel.hide();});
  panel.port.on('manage',function(event) {deferred.reject(event);panel.hide();Setup.chooseConfig();});
  // TODO: Send the URL to the UI

  // resolve the promise in a message handler from the script, or something
  panel.show();
  return deferred.promise;
};

Setup.chooseConfig = function() {
  // return a promise with selected config.
  let deferred = promise.defer();
  let panel = require("sdk/panel").Panel({
    width: 640,
    height: 240,
    contentURL: data.url("configs.html"),
    contentScriptFile: data.url("configs.js")
  });

  panel.show();
  configs = [];
  for (config of configManager.list()) {
    configs[configs.length] = config;
  }
  panel.port.emit("choose", {"names" : configs});
  panel.port.on("select", function(name){
    console.log("I got an event!");
    console.log(name);
    // clear any currently applied configs
    var configs = configManager.currentConfigs();
    if (configs.length > 0) {
      configManager.clear();
      console.log("cleared");
    }
    try {
      if ('none' != name) {
        configManager.applyConfig(name);
      }
    } catch (e) {
      console.log("error applying config: "+e.message);
      throw e;
    }
    panel.hide();
  });
  return deferred.promise;
}

Setup.configure = function(url) {
  return Configuration.fromURL(url).then(function(config) {
    if (config && config.manifest) {
      let name = config.manifest.toolName;

      if (configManager.currentConfigs().length > 0) {
        configManager.clear();
      }
      // save and apply the config
      try {
        configManager.saveConfig(config, name);
        configManager.applyConfig(name);
      } catch (e) {
        console.log("error applying config: "+e.message);
        throw e;
      }
      // TODO: add config data to allow the provider to display details
      return 'ok';
    } else {
      throw new Error("The manifest is not available for this tool.");
    }
  }.bind(this));
};

function Configuration(data) {
  if (data) {
    for (let key in data) {
      this[key] = data[key];
    }
  }
}

Configuration.fromURL = function(url) {
  let config = new Configuration();
  config.url = url;
  return readURI(url).then(function(data) {
    let manifest = JSON.parse(data);
      config.manifest = manifest;
      if (SUPPORTED_PROTOCOL >= config.manifest.protocolVersion){
        // TODO: Send some info on the proxy to userConfirm
        return Setup.userConfirm(url).then(function (evt) {
          console.log("confirmed with "+JSON.stringify(evt));
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
                config.cert = {"der":der,"base64":b64};

                return config;
              });
            } else {
              throw new Error('CA Cert is off origin. Configuration failed.');
            }
          } else {
            // we want a working config even if there's no proxy
            return config;
          }
        }, function() {
          throw new Error('Setup cancelled by user.');
        });
      } else {
        throw new Error('Version mismatch: fx_pnh supports protocol version '+SUPPORTED_PROTOCOL+' but '+manifest.toolName+ ' requires '+manifest.protocolVersion);
      }
  }, function() {
    throw new Error('Unable to load configuration from provider.');
  });
};

exports.setup = setup;
exports.configManager = configManager;
