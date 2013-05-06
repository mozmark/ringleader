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

const nsX509CertDB = "@mozilla.org/security/x509certdb;1";
const nsIX509Cert = Ci.nsIX509Cert;
const nsIX509CertDB = Ci.nsIX509CertDB;
certdb = Cc[nsX509CertDB].getService(nsIX509CertDB);

const {ProxyConfig, ProxyManager, HostPort} = require("./proxy");

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

  // TODO: tidy up globals; there's no need for this
  var added = false;

  // Is there a nicer event we can listen on? Preferably one which is only fired
  // once?
  events.on("content-document-global-created", function(event) {
    if (!added) {
      added = true;
      var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
      .getService(Ci.nsIWindowMediator);
  var mainWindow = wm.getMostRecentWindow("navigator:browser");
  mainWindow.gBrowser
      .addEventListener('ConfigureSecProxy',handleSetup,true,true);
    }
  });
  
  // fire an 'activated' event on the current document:
  var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
      .getService(Ci.nsIWindowMediator);
  var recentWindow = wm.getMostRecentWindow("navigator:browser");
  dispatchSetupEvent(recentWindow.content.document, 'ConfigureSecProxyActivated', {});
  console.log('setup');
};


var ConfigManager = function() {
  if (!storage.storage.configs) {
    storage.storage.configs = {};
  }
};

ConfigManager.prototype.list = function() {
  return Object.keys(storage.storage.configs);
};

ConfigManager.prototype.currentConfig = function() {
  return storage.storage.current;
};

ConfigManager.prototype.clear = function() {
  // get the name of the cert and the saved proxy config
  var config = this.fetchConfig(storage.storage.current);
  if (config) {
    var proxyConfig = JSON.parse(storage.storage.originalConfig);
    // remove the cert
    var cert;
    var cert = certdb.constructX509FromBase64(config.cert.base64.split('-----')[2].replace('\n','','g'));
    certdb.deleteCertificate(cert);
    // apply the original proxy config
    ProxyManager.applyConfig(proxyConfig);
    delete storage.storage.current;
  } else {
    throw new Error('cannot clear: there is no configuration currently applied');
  }
}

ConfigManager.prototype.saveConfig = function(config, name) {
  if (name === storage.storage.current) {
    throw new Error('cannot modify a currently used config');
  } else {
    storage.storage.configs[name] = JSON.stringify(config);
  }
};

ConfigManager.prototype.applyConfig = function(name) {
  var config = this.fetchConfig(name);
  if (!storage.storage.current) {
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
    }
  } else {
    throw new Error('cannot apply configuration: there is already a configuration applied');
  }
};

ConfigManager.prototype.deleteConfig = function(name) {
  if (name === storage.storage.current) {
    throw new Error('cannot remove configuration: currently in use');
  } else {
    delete storage.storage.configs[name];
  }
};

ConfigManager.prototype.fetchConfig = function(name) {
  var data =  storage.storage.configs[name];
  if (data) {
    var config = new Configuration(JSON.parse(data));
    return config;
  }
  return null;
};

var configManager = new ConfigManager();

var Setup = {
};

Setup.installCert = function(url) {
  
}

Setup.userConfirm = function() {
  // return a promise with user choice.
  var deferred = Promise.defer();
  var panel = require("sdk/panel").Panel({
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
  var deferred = Promise.defer();
  Configuration.fromURL(url).then(function(config) {
    var name = config.manifest.mitmTool;
    console.log('name is '+name);
    configManager.saveConfig(config, name);
    configManager.applyConfig(name);
    // TODO: add config data to allow the provider to display details
    deferred.resolve('ok');
  }, function(error) {
    //TODO: provide more useful information on what failed.
    deferred.reject('Setup failed');
  });
  return deferred.promise;
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
    // TODO: Send some info on the proxy to userConfirm
    Setup.userConfirm().then(function () {
      if(manifest.features.CACert) {
        // fetch and install the CA cert
        var certURL = manifest.features.CACert;
        // fetch data from the URL.
        readURI(certURL).then(function(data){
          // split off the header and footer, base64 decode
          var der = base64.decode(data.split('-----')[2].replace('\n','','g'));
          console.log('getting cert');
          var cert = certdb.constructX509FromBase64(data.split('-----')[2].replace('\n','','g'));
          console.log('got cert');
          // import the cert with appropriate trust bits.
          // TODO: make a suitably random nickname and store for safe removal later
          config.manifest = manifest;
          config.cert = {"der":der,"base64":data};
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
