/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// perform setup

const tabs = require("sdk/tabs");
const self = require("sdk/self");

const {Utils} = require("./secutils");
Utils.setupPrefs();

/* Attaches the content script */
tabs.activeTab.on("ready" , function() {
  console.log("\n\n\n ON LOAD \n\n\n");
  var worker = tabs.activeTab.attach({
      contentScriptFile: "content_script.js"
    });
  
    require("./config").setup();
  
    });

console.log('MAIN EXECUTION DONE');

// install the commands
//const {installCommands} = require("./commands");
//installCommands();
