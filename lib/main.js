/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cu} = require("chrome");
var mitm = require("./mitm");

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
    return mitm.installCert(args.url);
  }
});
