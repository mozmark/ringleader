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

const EVENT_CONFIG_CHANGED = "PnHConfigChanged";

let commands = [
  /**
   * 'pnh' command.
   */
  {
    name: "pnh",
      description: 'Commands for interacting with a Plug-n-Hack provider (e.g. OWASP ZAP)'
  },

  /**
   * 'pnh config' command
   */
  {
    name: 'pnh config',
    description: 'pnh configuration operations',
  },

  /**
   * 'pnh config clear' command
   * clear the current config.
   */
  {
    name: 'pnh config clear',
    description: 'clear the current pnh config',
    params: [
      {
        name: 'config',
          type: { name: 'selection', data: configManager.currentConfigs},
          description: 'the config to clear'
      }
    ],
    returnType: 'string',
    exec: function(args, context) {
      try {
        configManager.clear(false, args.config);
        return 'ok';
      }catch (e) {
        return e.message;
      }
    }
  },

  /**
   * 'pnh config list' command
   * list the available configs.
   */
  {
    name: 'pnh config list',
    description: 'list pnh configs',
    params: [],
    returnType: 'string',
    exec: function(args, context) {
      return configManager.list().join(', ');
    }
  },

  /**
   * 'pnh config apply' command
   * Apply a pnh config.
   */
  {
    name: 'pnh config apply',
    description: 'apply a pnh config',
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
        // TODO: if it's not a pnh Error give a stack / rethrow
        return e.message;
      }
    }
  },

  /**
   * 'pnh config remove' command
   * Remove the specified pnh config.
   */
  {
   name: 'pnh config remove',
    description: 'remove a pnh config',
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
        // TODO: if it's not a pnh Error give a stack / rethrow
        return e.message;
      }
    }
  },

  /**
   * 'pnh config show' command
   * Show the current pnh config.
   */
  {
    name: 'pnh config show',
    description: 'show the current config',
    params: [],
    returnType: 'string',
    exec: function(args, content) {
      try {
        let configs = configManager.currentConfigs();
        var names = [];
        for(let config in configs){
          names.push(configs[config]);
        }
        if (configs.length > 0) {
          return 'current configs are "'+JSON.stringify(names)+'"';
        }
        return 'there is no config currently applied';
      } catch (e) {
        // TODO: if it's not a pnh Error give a stack / rethrow
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
