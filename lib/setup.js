/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Setup} = require("./mitm");

const {Cc, Ci} = require("chrome");
var events = require("sdk/system/events");

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

