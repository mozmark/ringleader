/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var cancelClicked = function() {
  self.port.emit("cancel","Nope!");
};

self.port.on("test", function(evt){
  var names_div = document.getElementById("config_names");
  // names_div.textContent = JSON.stringify(evt);
  for (var name of evt.names) {
    // ul.name = "names_list";
    var input = document.createElement("input");
    input.type = "radio";
    input.value = name;
    input.name = "choices";
    var config = document.createElement("div");
    var nameNode = document.createTextNode(name);
    config.appendChild(input);
    config.appendChild(nameNode);
    names_div.appendChild(config);
  }
});
