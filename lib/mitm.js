/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc, Ci, Cu} = require("chrome");
const {readURI} = require("sdk/net/url");
const {open} = require("sdk/io/file");
var events = require("sdk/system/events");
var tabs_tabs = require("sdk/tabs/utils");
var base64 = require("sdk/base64");
var data = require("sdk/self").data;
var Promise = require('sdk/core/promise');
const {ProxyConfig, ProxyManager, HostPort} = require("./proxy");
Cu.import("resource://gre/modules/FileUtils.jsm");

const nsX509CertDB = "@mozilla.org/security/x509certdb;1";
const nsIX509Cert = Ci.nsIX509Cert;
const nsIX509CertDB = Ci.nsIX509CertDB;
certdb = Cc[nsX509CertDB].getService(nsIX509CertDB);

var Setup = {
};

Setup.installCert = function(url) {
  // fetch data from the URL.
  readURI(url).then(function(data){
    // split off the header and footer, base64 decode
    var der = base64.decode(data.split('-----')[2].replace('\n','','g'));
    // import the cert with appropriate trust bits.
    // TODO: make a suitably random nickname and store for safe removal later
    certdb.addCert(der,'Cu,,','MITM Test Cert');
    //certdb.importCertsFromFile(null, file, nsIX509Cert.CA_CERT);
  }, function(error) {
    console.log('something broke');
  });
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
  readURI(url).then(function(data) {
    var manifest = JSON.parse(data);
    var features = manifest.features;
    // TODO: Send some info on the proxy to userConfirm
    Setup.userConfirm().then(function () {
      if(features.CACert) {
        // fetch and install the CA cert
        console.log('CACert is '+features.CACert);
        Setup.installCert(features.CACert);
      }
      if(manifest.proxyPAC) {
        // configure from the proxy supplied PAC
        console.log('proxyPAC is '+manifest.proxyPAC);
        ProxyManager.applyAutoConfig(manifest.proxyPAC);
      }
    }, function () {
      console.log('user did not confirm...');
    });
  }, function(error) {
    console.log('something broke');
  });
};

Utils = {};

// utility function to get a window from a request
Utils.getRequestWindow = function(aRequest) {
    try {
        if (aRequest.notificationCallbacks)
        return aRequest.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    } catch(e) {}
    try {
        if(aRequest.loadGroup && aRequest.loadGroup.notificationCallbacks)
        return aRequest.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    } catch(e) {}
    return null;
};

//utility function to get a tab from a channel
Utils.getTabFromChannel = function(aChannel) {
    var wnd = Utils.getRequestWindow(aChannel);
    return (wnd && wnd.top == wnd) ? tabs_tabs.getTabForContentWindow(wnd.top) : null;
};

// utility to get the tab key (e.g. for tabModifiers) from a channel
Utils.getKeyFromChannel = function(aChannel) {
  var channelTab = Utils.getTabFromChannel(aChannel);
  if (channelTab) {
    if (channelTab._tabKey) {
      return channelTab._tabKey;
    }
  }
  return null;
};

Utils.getNewTabKey = function(){
  var current = 0;
  return function(){
    return current += 1;
  }
}();

Utils.getKeyFromContext = function(aContext) {
  var win = aContext.environment.contentDocument.defaultView;
  var tab = tabs_tabs.getTabForContentWindow(win);
  return Utils.getKeyFromTab(tab);
};

Utils.getKeyFromTab = function(aTab) {
  if (!aTab._tabKey) {
    aTab._tabKey = Utils.getNewTabKey();
  }
  return aTab._tabKey;
}

//utility function to get a tab from a channel
Utils.getWinFromChannel = function(aChannel) {
    return Utils.getRequestWindow(aChannel);
};

var Modifiers = {};

// header modifiers for the request observer
Modifiers.recordModify = function(aChannel) {
  aChannel.setRequestHeader('X-Security-Proxy','record', true);
};

Modifiers.interceptModify = function(aChannel) {
  aChannel.setRequestHeader('X-Security-Proxy','intercept', true);
};

var MitmProxy = function() {
  // we want to map tabs to lists(?) of modifiers so we can run the modifiers
  // for any given tab - means we can keep state out of tab expandos
  this.tabModifiers = {};
  this.allModifiers = [];

  //register the modify handler
  events.on("http-on-modify-request", this.modify.bind(this), true);
}

MitmProxy.prototype.modify = function(aEvent) {
  var channel = aEvent.subject.QueryInterface(Ci.nsIHttpChannel);
  var key = Utils.getKeyFromChannel(channel);
  var modifiers = this.tabModifiers[key];
  for (key in modifiers) {
    var modifier = modifiers[key];
    // apply the modifier
    modifier(channel);
  }
}

MitmProxy.prototype.addModifier = function(aModifier, aTab) {
  // unless there's a tab specified, modifiers should be global
  var modifiers = this.allModifiers;
  if (aTab) {
    // there's a tab specified, let's get the modifiers for this tab
    if (!this.tabModifiers[aTab]) {
      // there are no modifiers for the tab, add this as the only one
      this.tabModifiers[aTab] = [];
    }
    modifiers = this.tabModifiers[aTab];
  }
  if (-1 == modifiers.indexOf(aModifier)) {
    modifiers.push(aModifier);
  }
};

MitmProxy.prototype.removeModifier = function(aModifier, aTab) {
  // unless there's a tab specified, we're removing a global modifier
  var modifiers = this.allModifiers;
  if (aTab) {
    // there's a tab specified, let's get the modifiers for this tab
    if (this.tabModifiers[aTab]) {
      // there are modifiers for the tab?
      modifiers = this.tabModifiers[aTab];
    } else {
      // a tab was supplied but there are modifiers
      modifiers = null;
    }
  }
  if (modifiers) {
    if (modifiers.indexOf(aModifier) >= 0) {
      modifiers.splice(modifiers.indexOf(aModifier),1);
    }
  }
};

MitmProxy.prototype.intercept = function(tab) {
  this.addModifier(Modifiers.interceptModify, tab)
};

exports.MITM = new MitmProxy();
exports.Setup = Setup;
exports.Utils = Utils;
exports.Modifiers = Modifiers;
