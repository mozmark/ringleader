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

const nsX509CertDB = "@mozilla.org/security/x509certdb;1";
const nsIX509Cert = Ci.nsIX509Cert;
const nsIX509CertDB = Ci.nsIX509CertDB;
certdb = Cc[nsX509CertDB].getService(nsIX509CertDB);

const {ProxyConfig, ProxyManager, HostPort} = require("./proxy");

// register the custom event listener to allow proxies to be registered:
var handleSetup = function(event){
  var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
      .getService(Ci.nsIWindowMediator);
  var mainWindow = wm.getMostRecentWindow("navigator:browser");
  let domWindowUtils = mainWindow.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindowUtils);
  if (domWindowUtils.isHandlingUserInput) {
    Setup.configure(event.detail.url);
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
