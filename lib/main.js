/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc, Cu, Ci} = require("chrome");
var tabs_tabs = require("sdk/tabs/utils");
const {Setup, MITM, Utils, Modifiers} = require("./mitm");
const {ProxyRecorder} = require("./toolbarui.js");
var events = require("sdk/system/events");

Cu.import("resource:///modules/devtools/gcli.jsm");

/**
 * 'mitm' command.
 */
gcli.addCommand({
  name: "mitm",
  description: 'Commands for interacting with a MITM proxy (e.g. OWASP ZAP)'
});

gcli.addCommand({
  name: 'mitm intercept',
  description: 'delete a proxy configuration',
  params: [
    {
      name: 'action',
      type: { name: 'selection', data: [ 'add', 'remove' ] },
      description: 'Add or remove',
      defaultValue: 'add',
    },
    {
      name: 'scope',
      type: { name: 'selection', data: [ 'tab', 'global' ] },
      description: 'The scope for interception (e.g. tab or global)',
      defaultValue: 'tab',
    }
  ],
  returnType: 'string',
  exec: function(args, context) {
    // uhh. do something
    var key = null;
    if (args.scope && 'tab' == args.scope) {
      key = Utils.getKeyFromContext(context);
    }
    if (args.action && 'add' == args.action) {
      MITM.addModifier(Modifiers.interceptModify, key);
    } else {
      MITM.removeModifier(Modifiers.interceptModify, key);
    }
    return 'ok';
  }
});

// register the custom event listener to allow proxies to be registered:
var handleSetup = function(event){
    Setup.configure(event.detail.url);
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

// Hook in the legacy demo UI
var thingy = new ProxyRecorder();
