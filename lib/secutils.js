/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Ci} = require("chrome");
const tabs_tabs = require("sdk/tabs/utils");
const {jsonPath} = require("./jsonpath");

Utils = {};

// utility function to get a window from a request
Utils.getRequestWindow = function (aRequest) {
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
Utils.getTabFromChannel = function (aChannel) {
    let wnd = Utils.getRequestWindow(aChannel);
    return (wnd && wnd.top == wnd) ? tabs_tabs.getTabForContentWindow(wnd.top) : null;
};

// utility to get the tab key (e.g. for tabModifiers) from a channel
Utils.getKeyFromChannel = function (aChannel) {
  let channelTab = Utils.getTabFromChannel(aChannel);
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

  let tab = tabs_tabs.getTabForContentWindow(win);
  return Utils.getKeyFromTab(tab);
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
