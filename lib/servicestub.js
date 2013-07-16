/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cu} = require("chrome");
const {jsonPath} = require('./jsonpath');
const {Utils} = require('./secutils');
const {Substitutions} = require('./substitutions');
const {readURI} = require("sdk/net/url");
const Promise = require('sdk/core/promise');

Cu.import("resource:///modules/devtools/gcli.jsm");

function buildParams(params) {
  let idx;
  for (idx in params) {
    modifyType(params[idx].type);
  }
  return params;
}

function modifyType(type) {
  if("object" === typeof type) {
    // replace selection 'data' with fetched data if 'fetchData' is set
    if (type.name && "selection" === type.name &&
        type.dataAction &&
        type.dataAction.url &&
        type.dataAction.expression) {
      type.data = function fetchData() {
        return readURI(type.dataAction.url)
            .then(function(d) {
              let obj = JSON.parse(d);
              let result = jsonPath(obj, type.dataAction.expression);
              return result;
            }, function daError(e) {
              return e;
            });
      };
    }
  }
}

function getCallbackInfo(callback, data) {
  return {
    sent:false,
    callback:callback,
    template:JSON.parse(JSON.stringify(data)),
    addArgs:function(args) {
      this.args = args;
      this.checkSend();
    },
    addResponse:function(response) {
      this.response = response;
      this.checkSend();
    },
    addKey:function(key) {
      this.key = key;
      this.template.key = key;
    },
    checkSend:function() {
      // substitute values in template
      this.template.args = this.args;
      this.template.response = this.response;
      if (!this.sent &&
          Substitutions.modifyData(this.template, this.template)) {
        // TODO: check callback is actually a function. Also, we should
        // probably check if callback is OK before bothering with adding
        // args and response

        if (this.callback) {
          this.callback(this.template);
        }
        this.sent = true;
      } else {
        // warn if both this.args and this.response are present
        // and modify fails
        if (this.args && this.response && this.callback) {
          console.log("modification failed even with args and response");
        }
      }
    }
  }
}

/**
 * Create command proxies from a descriptor; give the resulting commands the
 * specified prefix.
 */
var ServiceStub = function (url, prefix, callback) {
  this.url = url;
  this.prefix = prefix;
  this.callback = callback;
  this.manifest = {};
};

/**
  * Take a command object and augment.
  */
ServiceStub.prototype.modCommand = function(command) {
  try {
    let callbackData = {};
    if (command.execAction && command.execAction.callbackData) {
      callbackData = command.execAction.callbackData;
    }
    if (command.name) {
      command.name = this.prefix+' '+command.name;
    } else {
      command.name = this.prefix;
    }
    if (command.params) {
      command.params = buildParams(command.params);
    }
    if (command.execAction) {
      let callback = this.callback;
      command.exec = function ServiceStub_exec(args, context) {
        let callbackInfo = getCallbackInfo(callback, callbackData);
        callbackInfo.addKey(Utils.getKeyFromContext(context));
        callbackInfo.addArgs(args);

        if (command.execAction.url) {
          let generatedURL = command.execAction.url;
          // This is dumb and messy, sort it out
          // TODO: tidy the below when issue #42 is resolved
          if ("object" === typeof generatedURL) {
            Substitutions.modifyData(command.execAction, callbackInfo);
            generatedURL = command.execAction.url;
            console.log('All ok here...');
          } else {
              generatedURL = encodeURIComponent(
                  Substitutions.parameterize(command.execAction.url,args));
          }
          return readURI(generatedURL).then(function (data) {
            let result = 'OK';
            if (command.execAction && command.execAction.expression) {
              let obj = JSON.parse(data);
              result = jsonPath(obj,command.execAction.expression);
              callbackInfo.addResponse(obj);
            }
            return result;
          },
          function (error) {
            console.log('there was problem reading the command URI');
            return error;
          });
        } else {
          let deferred = Promise.defer();
          deferred.resolve("OK");
          return deferred.promise;
        }
      };
    }
  } catch (e) {
    console.log(e);
  }
};

/**
 * Fetches the available command descriptions from the descriptor, adds the
 * GCLI commands for each.
 */
ServiceStub.prototype.hook = function () {
  readURI(this.url).then(function(data) {
    this.manifest = JSON.parse(data);
    let key;
    let commands = this.manifest.commands;
    let prefix = this.manifest.prefix;

    for(key in commands) {
      let command = commands[key];
      // replace JSON descriptor info with actual parameter objects / functions
      // (where applicable)
      this.modCommand(command);
      gcli.addCommand(command);
    }
  }.bind(this),
  function(error) {
    console.log(error);
  });
};

exports.ServiceStub = ServiceStub;
