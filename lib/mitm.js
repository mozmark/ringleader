/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cc, Ci, Cu} = require("chrome");
const events = require("sdk/system/events");
const tabs_tabs = require("sdk/tabs/utils");
const {jsonPath} = require("./jsonpath");
const {Utils} = require("./secutils");

function HeaderModifier(name) {
  this.headerName = name;
  this.values = [];
}

HeaderModifier.prototype.addValue = function(value) {
  if (-1 == this.values.indexOf(value)) {
    this.values.push(value);
  }
};

HeaderModifier.prototype.removeValue = function(value) {
  let index = this.values.indexOf(value);
  if (-1 != value) {
    this.values.splice(index,1);
  }
};

HeaderModifier.prototype.modify = function(aChannel) {
  for (let idx in this.values) {
    aChannel.setRequestHeader(this.headerName,this.values[idx],true);
  }
};

function ModifierScopes() {
  let scopes = {};
  return {
    getScope:function(key) {
      if (!key) {
        key = 'global';
      }
      if (!scopes[key]) {
        scopes[key] = {};
      }
      return scopes[key];
    }
  };
}

var MitmProxy = function () {
  // we want to map tabs to lists(?) of modifiers so we can run the modifiers
  // for any given tab - means we can keep state out of tab expandos
  this.modifierScopes = ModifierScopes();

  //register the modify handler
  events.on("http-on-modify-request", this.modify.bind(this), true);
}

MitmProxy.prototype.modify = function (aEvent) {
  let channel = aEvent.subject.QueryInterface(Ci.nsIHttpChannel);
  let key = Utils.getKeyFromChannel(channel);
  let runModifiers = function(scope) {
    for (let type in scope) {
      for(let idx in scope[type]) {
        let modifier = scope[type][idx];
        modifier.modify(channel);
      }
    }
  };
  // run global modifiers
  runModifiers(this.modifierScopes.getScope());

  //run modifiers for tab
  runModifiers(this.modifierScopes.getScope(key));
}

MitmProxy.prototype.callback = function (callbackData) {
  let commands = [];
  let key = callbackData.key;
  let addCommands = function(toAdd) {
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
      if (result && result[0] && callbackData.conditionalCommands.states[result[0]]) {
        addCommands(callbackData.conditionalCommands.states[result[0]]);
      }
    } else {
      // TODO: log this; it's a problem
    }
  }

  let scopes = this.modifierScopes;

  /*
   * find a header modifier pertaining to a command
   */
  let findHeaderModifier = function(command) {
    if (command.params && command.params.headerName) {
      let headerName = command.params.headerName;
      let commandKey = key;
      // TODO: if the command specifies global, set commandKey = 'global'
      if (command.params.scope && 'global' === command.params.scope) {
        commandKey = 'global';
      }
      let scope = scopes.getScope(commandKey);
      if (!scope['HeaderModifiers']) {
        scope['HeaderModifiers'] = {};
      }
      let headerModifiers = scope['HeaderModifiers'];
      if (!headerModifiers[headerName]) {
        headerModifiers[headerName] = new HeaderModifier(headerName);
      }
      return headerModifiers[headerName];
    }
    return null;
  };

  // execute the commands in the command list
  for(let idx in commands){
    let command = commands[idx];
    if (command.command && command.command === 'addToHeader') {
      let modifier = findHeaderModifier(command);
      if (modifier) {
        modifier.addValue(command.params.value);
      }
    }
    if (command.command && command.command === 'removeFromHeader') {
      let modifier = findHeaderModifier(command);
      if (modifier) {
        modifier.removeValue(command.params.value);
        // TODO: if there are no values, maybe remove the modifier?
      }
    }
  }
};

exports.MITM = new MitmProxy();
