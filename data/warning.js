/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var cancelClicked = function() {
  self.port.emit('cancel','Nope!');
};

var confirmClicked = function() {
  if (document.getElementById('yup').checked) {
    self.port.emit('confirm','ok');
  }
};

var checkboxClicked = function(event) {
  document.getElementById('confirm').disabled = !event.target.checked;
};

var manageClicked = function() {
  self.port.emit('manage','manage');
};

document.getElementById('confirm').addEventListener('click', confirmClicked, false);
document.getElementById('cancel').addEventListener('click', cancelClicked, false);
document.getElementById('yup').addEventListener('click', checkboxClicked, false);
document.getElementById('manage').addEventListener('click', manageClicked, false);
