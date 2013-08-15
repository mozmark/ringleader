/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cu} = require("chrome");
Cu.import("resource:///modules/devtools/gcli.jsm");
const {MITM} = require("./mitm");
const {Utils} = require("./secutils");
const {configManager} = require("./config");

const EVENT_CONFIG_CHANGED = "MitmConfigChanged";

let commands = [
  /**
   * 'ringleader' command.
   */
  {
    name: "ringleader",
      description: 'Commands for interacting with a MITM proxy (e.g. OWASP ZAP)'
  },

  /**
   * 'ringleader config' command
   */
  {
    name: 'ringleader config',
    description: 'ringleader configuration operations',
  },

  /**
   * 'ringleader config clear' command
   * clear the current config.
   */
  {
    name: 'ringleader config clear',
    description: 'clear the current ringleader config',
    params: [],
    returnType: 'string',
    exec: function(args, context) {
      try {
        configManager.clear();
        return 'ok';
      }catch (e) {
        return e.message;
      }
    }
  },

  /**
   * 'ringleader config list' command
   * list the available configs.
   */
  {
    name: 'ringleader config list',
    description: 'list ringleader configs',
    params: [],
    returnType: 'string',
    exec: function(args, context) {
      return configManager.list().join(', ');
    }
  },

  /**
   * 'ringleader config apply' command
   * Apply a ringleader config.
   */
  {
    name: 'ringleader config apply',
    description: 'apply a ringleader config',
    params: [
      {
        name: 'config',
          type: { name: 'selection', data: configManager.list },
          description: 'the config to use'
      }
    ],
    returnType: 'string',
    exec: function(args, content) {
      try {
        configManager.applyConfig(args.config);
        return 'ok'
      } catch(e) {
        // TODO: if it's not a ringleader Error give a stack / rethrow
        return e.message;
      }
    }
  },

  /**
   * 'ringleader config remove' command
   * Remove the specified ringleader config.
   */
  {
   name: 'ringleader config remove',
    description: 'remove a ringleader config',
    params: [
      {
        name: 'config',
          type: { name: 'selection', data: configManager.list },
          description: 'the config to remove'
      }
    ],
    returnType: 'string',
    exec: function(args, content) {
      try {
        configManager.deleteConfig(args.config);
        return 'ok';
      } catch (e) {
        // TODO: if it's not a ringleader Error give a stack / rethrow
        return e.message;
      }
    }
  },

  /**
   * 'ringleader config show' command
   * Show the current ringleader config.
   */
  {
    name: 'ringleader config show',
    description: 'show the current config',
    params: [],
    returnType: 'string',
    exec: function(args, content) {
      try {
        let name = configManager.currentConfig();
        if (name) {
          return 'current config is "'+name+'"';
        }
        return 'there is no config currently applied';
      } catch (e) {
        // TODO: if it's not a ringleader Error give a stack / rethrow
        return e.message;
      }
    }
  }
];

/**
 * Refresh the current commands according to the current config.
 * remove, boolean - should conditional commands be removed prior to others
 * being added? Mostly useful at initial setup when conditional commands aren't
 * already there.
 * config - The current configuration.
 */
function refreshCommands(remove, config) {
  for(idx in commands) {
    let command = commands[idx];
    if (command.conditional) {
      if (remove) {
        gcli.removeCommand(command.name);
      }
      if (command.conditional(config)) {
        gcli.addCommand(command);
      }
    }
  }
}

/**
 * Install the commands.
 */
function installCommands() {
  for(idx in commands) {
    if (!commands[idx].conditional) {
      gcli.addCommand(commands[idx]);
    }
  }
  // TODO: Get a current config in here.
  refreshCommands(false);
}

configManager.on(EVENT_CONFIG_CHANGED, function(config) {
  refreshCommands(true,config);
});

exports.installCommands = installCommands;
