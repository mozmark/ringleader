/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cu} = require("chrome");
Cu.import("resource:///modules/devtools/gcli.jsm");
const {MITM, Utils, Modifiers} = require("./mitm");
const {configManager} = require("./config");

let commands = [
  /**
   * 'mitm' command.
   */
  {
    name: "mitm",
      description: 'Commands for interacting with a MITM proxy (e.g. OWASP ZAP)'
  },

  /**
   * 'mitm break' command
   */
  {
    name: 'mitm break',
    description: 'break on request and response with a MITM tool',
    conditional: function(config) {
      if (config && config.manifest.features.break) {
        return true;
      }
    },
    params: [
      {
        name: 'action',
          type: { name: 'selection', data: [ 'on', 'off' ] },
          description: 'on or off',
          defaultValue: 'on',
      },
      {
        name: 'scope',
          type: { name: 'selection', data: [ 'tab', 'global' ] },
          description: 'The scope for breakpoints (e.g. tab or global)',
          defaultValue: 'tab',
      }
    ],
    returnType: 'string',
    exec: function(args, context) {
      // uhh. do something
      let key = null;
      if (args.scope && 'tab' == args.scope) {
        key = Utils.getKeyFromContext(context);
      }
      if (args.action && 'on' == args.action) {
        MITM.addModifier(Modifiers.interceptModify, key);
      } else {
        MITM.removeModifier(Modifiers.interceptModify, key);
      }
      return 'ok';
    }
  },

  /**
   * 'mitm record' command
   */
  {
    name: 'mitm record',
    description: 'record traffic with a MITM tool',
    conditional: function(config) {
      if (config && config.manifest.features.record) {
        return true;
      }
    },
    params: [
      {
        name: 'action',
          type: { name: 'selection', data: [ 'on', 'off' ] },
          description: 'on or off',
          defaultValue: 'on',
      },
      {
        name: 'scope',
          type: { name: 'selection', data: [ 'tab', 'global' ] },
          description: 'The scope for recording (e.g. tab or global)',
          defaultValue: 'tab',
      }
    ],
    returnType: 'string',
    exec: function(args, context) {
      // uhh. do something
      let key = null;
      if (args.scope && 'tab' == args.scope) {
        key = Utils.getKeyFromContext(context);
      }
      if (args.action && 'on' == args.action) {
        MITM.addModifier(Modifiers.recordModify, key);
      } else {
        MITM.removeModifier(Modifiers.recordModify, key);
      }
      return 'ok';
    }
  },

  /**
   * 'mitm config' command
   */
  {
    name: 'mitm config',
    description: 'mitm configuration operations',
  },

  /**
   * 'mitm config clear' command
   * clear the current config.
   */
  {
    name: 'mitm config clear',
    description: 'clear the current mitm config',
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
   * 'mitm config list' command
   * list the available configs.
   */
  {
    name: 'mitm config list',
    description: 'list mitm configs',
    params: [],
    returnType: 'string',
    exec: function(args, context) {
      return configManager.list().join(', ');
    }
  },

  /**
   * 'mitm config apply' command
   * Apply a mitm config.
   */
  {
    name: 'mitm config apply',
    description: 'apply a mitm config',
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
        // TODO: if it's not a mitm Error give a stack / rethrow
        return e.message;
      }
    }
  },

  /**
   * 'mitm config remove' command
   * Remove the specified mitm config.
   */
  {
   name: 'mitm config remove',
    description: 'remove a mitm config',
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
        // TODO: if it's not a mitm Error give a stack / rethrow
        return e.message;
      }
    }
  },

  /**
   * 'mitm config show' command
   * Show the current mitm config.
   */
  {
    name: 'mitm config show',
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
        // TODO: if it's not a mitm Error give a stack / rethrow
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

configManager.on('MitmConfigChanged',function(config) {
  refreshCommands(true,config);
});

exports.installCommands = installCommands;
