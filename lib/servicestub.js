/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Cu} = require("chrome");

var gcli = undefined;

// try {
//   Cu.import("resource:///modules/devtools/gcli.jsm");
// } catch (e) {
//   let { devtools } = Cu.import("resource://gre/modules/devtools/Loader.jsm", {});
//   gcli = devtools["req" + "uire"]("gcli/index");
// }

const {jsonPath} = require('./jsonpath');
const {Utils} = require('./secutils');
const {Substitutions} = require('./substitutions');
const {readURI} = require("sdk/net/url");
const {XMLHttpRequest} = require("sdk/net/xhr");
const promise = require('sdk/core/promise');



function buildParams(params, aURL) {
  let idx;
  for (idx in params) {
    modifyType(params[idx].type, aURL);
  }
  return params;
}

function modifyType(type, aURL) {
  if("object" === typeof type) {
    // replace selection 'data' with fetched data if 'fetchData' is set
    if (type.name && "selection" === type.name &&
        type.dataAction &&
        type.dataAction.url &&
        type.dataAction.expression) {
          if(!aURL || aURL && Utils.CheckOrigin(aURL, type.dataAction.url)) {
            type.data = function fetchData(context) {
              let actionCtx = {args:context.getArgsObject()};
              let generatedURL = Substitutions.parameterize(type.dataAction.url, actionCtx, true);
              return readURI(generatedURL)
            .then(function(d) {
              let obj = JSON.parse(d);
              let result = jsonPath(obj, type.dataAction.expression);
              return result;
            }, function daError(e) {
              return e;
            });
            };
          } else {
            console.log('Could not perform dataAction due to origin restrictions');
            type.data = [];
          }
    }
  }
}

function getCallbackInfo(callback, data) {
  return {
    sent:false,
    callback:callback,
    template:JSON.parse(JSON.stringify(data)),
    addArgs:function(args) {
      this.template.args = args;
      this.checkSend();
    },
    addResponse:function(response) {
      this.template.response = response;
      this.checkSend();
    },
    /**
     * Add context specific information to the command data (tab ID, etc)
     */
    addContextInfo:function(context) {
      var key = Utils.getKeyFromContext(context);
      let location = Utils.getDocumentFromContext(context).location;
      this.template.tab = {
        key: key,
        URL: Utils.getDocumentFromContext(context).URL,
        location: {
          hash:location.hash,
          host:location.host,
          hostname:location.hostname,
          href:location.href,
          pathname:location.pathname,
          port:location.port,
          protocol:location.protocol,
          search:location.search
        }
      };
    },
    checkSend:function() {
      // substitute values in template
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
  let descriptorURL = this.url;
  try {

    command.item = "command";
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
      command.params = buildParams(command.params, this.url);
    }
    if (command.execAction) {
      let callback = this.callback;
      command.exec = function ServiceStub_exec(args, context) {
        let callbackInfo = getCallbackInfo(callback, callbackData);
        callbackInfo.addContextInfo(context);
        callbackInfo.addArgs(args);

        if (command.execAction.url) {
          let generatedURL = command.execAction.url;
          // This is dumb and messy, sort it out
          // TODO: tidy the below when issue #42 is resolved
          if ("object" === typeof generatedURL) {
            Substitutions.modifyData(command.execAction, callbackInfo);
            generatedURL = command.execAction.url;
          } else {
              generatedURL = Substitutions.parameterize(command.execAction.url,callbackInfo.template,true);
          }
          if(Utils.CheckOrigin(descriptorURL, generatedURL)) {
            let deferred = promise.defer();

            let method = "GET";
            if (command.execAction.method) {
              method = command.execAction.method;
            }

            let requestBody = null;
            if (command.execAction.requestBody) {
              requestBody = Substitutions.parameterize(command.execAction.requestBody,callbackInfo.template,true);
            }

            let contentType= "application/json";
            if (command.execAction.contentType) {
              contentType = command.execAction.contentType;
            }

            xhr = new XMLHttpRequest();
            xhr.open(method, generatedURL, true);
            xhr.setRequestHeader("content-type",contentType);
            xhr.onload = function() {
              let result = 'OK';
              if(command.execAction.expression) {
                console.log('response text is '+this.responseText);
                let obj = JSON.parse(this.responseText);
                result = jsonPath(obj,command.execAction.expression);
                callbackInfo.addResponse(obj);
                console.log('obj is '+JSON.stringify(obj));
                console.log('response is '+result);
              }
              deferred.resolve(result);
            }
            xhr.onerror = function(error) {
              console.log('there was problem reading the command URI');
              deferred.reject(error);
            };

            xhr.send(requestBody);
            return deferred.promise;

          } else {
            console.log('origin checks for execAction failed');
            throw new Error('help!');
          }
        } else {
          let deferred = promise.defer();
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
    try {
      this.manifest = JSON.parse(data);
      let key;
      let commands = this.manifest.commands;
      let prefix = this.manifest.prefix;

      for(key in commands) {
        let command = commands[key];
        // replace JSON descriptor info with actual parameter objects / functions
        // (where applicable)
        this.modCommand(command);
        // if (gcli.addCommand) {
        //   gcli.addCommand(command);
        // } else {
        //   gcli.addItems([command]);
        // }
      }
    } catch (e) {
      console.log("Error: unable to parse descriptor "+e);
    }
  }.bind(this),
  function(error) {
    console.log(error);
  });
};

exports.ServiceStub = ServiceStub;
