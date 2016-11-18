/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Ci, Cc} = require("chrome");
const tabs_tabs = require("sdk/tabs/utils");
const system = require("sdk/system");
const {jsonPath} = require("./jsonpath");

var prefManager = Cc["@mozilla.org/preferences-service;1"]
  .getService(Ci.nsIPrefBranch);

Utils = {};

Utils.setupPrefs = function() {
  if (system.staticArgs && system.staticArgs.prefs) {
    for (pref in system.staticArgs.prefs) {
      var prefValue = system.staticArgs.prefs[pref];
      // TODO: have some way of checking pref type, call appropriate setPref
      prefManager.setCharPref(pref,prefValue);
    }
  }
};

// utility function to get a window from a request
Utils.getRequestWindow = function (aRequest) {
    try {
        if (aRequest.notificationCallbacks)
        return aRequest.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    } catch(e) {}
    try {
        if (aRequest.loadGroup && aRequest.loadGroup.notificationCallbacks)
        return aRequest.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    } catch(e) {}

    return null;
};

//utility function to get a tab from a channel
Utils.getTabFromChannel = function (topWindow) {
    let wnd = topWindow;
    return (wnd && wnd.top == wnd) ? tabs_tabs.getTabForContentWindow(wnd) : null;
};

// utility to get the tab key (e.g. for tabModifiers) from a channel
Utils.getKeyFromChannel = function (topWindow) {
  let channelTab = Utils.getTabFromChannel(topWindow);
  if (channelTab) {
    if (channelTab._tabKey) {
      return channelTab._tabKey;
    }
  }
  return null;
};

Utils.getNewTabKey = function () {
  let current = 0;
  return function(){
    return current += 1;
  }
}();

Utils.getDocumentFromContext = function(aContext) {
  let doc = null;
  try {
    doc = aContext.environment.contentDocument;
    if (!doc) {
      doc = aContext.environment.document;
    }
    win = doc.defaultView;
  } catch (ex) {
    let chromeWindow = aContext.environment.chromeDocument.defaultView;
    let tabbrowser = chromeWindow.gBrowser;
    let browser = tabbrowser.getBrowserForTab(tabbrowser.selectedTab);
    doc = browser.contentDocument;
  }
  return doc;
};

Utils.getKeyFromContext = function (aContext) {
  let win = null;
  try {
    let doc = aContext.environment.contentDocument;
    if (!doc) {
      doc = aContext.environment.document;
    }
    win = doc.defaultView;
  } catch (ex) {
    let chromeWindow = aContext.environment.chromeDocument.defaultView;
    let tabbrowser = chromeWindow.gBrowser;
    let browser = tabbrowser.getBrowserForTab(tabbrowser.selectedTab);
    let document = browser.contentDocument;
    win = document.defaultView;
  }
  console.log("DOC IS:" + doc);
  console.log("WINDOWS IS:" + win);
  let tab = tabs_tabs.getTabForContentWindow(win);
  return Utils.getKeyFromTab(tab);
};

Utils.CheckOrigin = function(aURL1, aURL2) {
  var ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
  var u1 = ioService.newURI(aURL1, null, null);
  var u2 = ioService.newURI(aURL2, null, u1);

  var ignorePort = false;
  var prefValue = '';
  try {
    prefValue = prefManager.getCharPref('pnh.check.origin');
    if (prefValue && prefValue === 'noport') {
      console.log('port checks will be ignored');
      ignorePort = true;
    }
  } catch (e) {
    // we don't care if pref check fails; it's most likely not there
  }

  if (prefValue && prefValue === 'off') {
    console.log('origin checks will be ignored');
    return true;
  }
  // check scheme
  if (!u2.schemeIs(u1.scheme)) {
    console.log('origin check failed for '+aURL1+' and '+aURL2+': scheme does not match');
    return false;
  }
  // check host
  if (u2.host!==u1.host) {
    console.log('origin check failed for '+aURL1+' and '+aURL2+': host does not match');
    return false;
  }
  // check port
  if (!ignorePort && u2.port!==u1.port) {
    console.log('origin check failed for '+aURL1+' and '+aURL2+': port does not match');
    return false;
  }
  return true;
};

Utils.getKeyFromTab = function (aTab) {
  if (!aTab._tabKey) {
    aTab._tabKey = Utils.getNewTabKey();
  }
  return aTab._tabKey;
}

//utility function to get a tab from a channel
Utils.getWinFromChannel = function (aChannel) {
    return Utils.getRequestWindow(aChannel);
};

exports.Utils = Utils;
