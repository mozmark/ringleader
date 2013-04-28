/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cu, Ci} = require("chrome");
var tabs_tabs = require("sdk/tabs/utils");
const {Setup, MITM, Utils, Modifiers} = require("./mitm");
const {ProxyRecorder} = require("./toolbarui.js");

Cu.import("resource:///modules/devtools/gcli.jsm");

/**
 * 'mitm' command.
 */
gcli.addCommand({
  name: "mitm",
  description: 'Commands for interacting with a MITM proxy (e.g. OWASP ZAP)'
});

gcli.addCommand({
  name: 'mitm cert',
  description: 'delete a proxy configuration',
  params: [
    {
      name: 'url',
      type: 'string',
      description: 'The URL of the cert to install',
      defaultValue: 'http://localhost:8080/OTHER/core/other/rootcert',
    }
  ],
  returnType: 'string',
  exec: function(args, context) {
    return Setup.installCert(args.url);
  }
});

// context.environment.chromedocument.defaultview seems to be a way to get a
// chromeWindow

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

var thingy = new ProxyRecorder();
