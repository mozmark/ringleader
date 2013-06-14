/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc, Ci, Cu} = require("chrome");
const events = require("sdk/system/events");
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

Utils.getKeyFromContext = function (aContext) {
  let doc = aContext.environment.contentDocument;
  if (!doc) {
    doc = aContext.environment.document;
  }
  let win = doc.defaultView;
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

let Modifiers = {};

// header modifiers for the request observer
Modifiers.recordModify = function (aChannel) {
  aChannel.setRequestHeader('X-Security-Proxy','record', true);
};

Modifiers.interceptModify = function (aChannel) {
  aChannel.setRequestHeader('X-Security-Proxy','intercept', true);
};

var MitmProxy = function () {
  // we want to map tabs to lists(?) of modifiers so we can run the modifiers
  // for any given tab - means we can keep state out of tab expandos
  this.tabModifiers = {};
  this.allModifiers = [];

  //register the modify handler
  events.on("http-on-modify-request", this.modify.bind(this), true);
}

MitmProxy.prototype.modify = function (aEvent) {
  let channel = aEvent.subject.QueryInterface(Ci.nsIHttpChannel);
  let key = Utils.getKeyFromChannel(channel);
  let modifiers = this.tabModifiers[key];
  for (key in modifiers) {
    let modifier = modifiers[key];
    // apply the modifier
    modifier(channel);
  }
}

MitmProxy.prototype.addModifier = function (aModifier, aTab) {
  // unless there's a tab specified, modifiers should be global
  let modifiers = this.allModifiers;
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

MitmProxy.prototype.removeModifier = function (aModifier, aTab) {
  // unless there's a tab specified, we're removing a global modifier
  let modifiers = this.allModifiers;
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

MitmProxy.prototype.callback = function (callbackData) {
  console.log("callback data is : "+JSON.stringify(callbackData));
  let commands = [];
  let key = callbackData.key;
  console.log('key is :'+key);
  let addCommands = function(toAdd) {
    console.log('toAdd is '+JSON.stringify(toAdd));
    for (idx in toAdd) {
      commands.push(toAdd[idx]);
    }
  }
  if (callbackData && callbackData.commands) {
    addCommands(callbackData.commands);
  }
  if (callbackData && callbackData.conditionalCommands) {
    let expression = callbackData.conditionalCommands.expression;
    if (expression) {
      let result = jsonPath(callbackData, expression);
      console.log('result is: '+JSON.stringify(result));
      if (result && result[0] && callbackData.conditionalCommands.states[result[0]]) {
        addCommands(callbackData.conditionalCommands.states[result[0]]);
      }
    } else {
      // TODO: log this; it's a problem
    }
  }
  console.log('commands to execute: '+JSON.stringify(commands));
};

MitmProxy.prototype.intercept = function (aTab) {
  this.addModifier(Modifiers.interceptModify, aTab)
};

exports.MITM = new MitmProxy();
exports.Utils = Utils;
exports.Modifiers = Modifiers;
