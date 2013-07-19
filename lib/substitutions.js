/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

jsonpath = require("./jsonpath");

var Substitutions = {
  parameterize : function(aStr, aParams, URLEncode) {
    var re_outer = /(\$\{\S+\})/;
    var re_inner = /\$\{(\S+)\}/;

    var substitute = function(tok) {
      var match = tok.match(re_inner);
      if (match && match[1]) {
        var inner = match[1];
        var result;
        if(-1 != inner.indexOf('$')) {
          result = jsonpath.jsonPath(aParams, inner);
        } else if(aParams[match[1]]){
          result = aParams[match[1]];
        }
        if (URLEncode) {
          return encodeURIComponent(result);
        } else {
          return result;
        }
      }
      return tok;
    };
    var substituted = [];
    var toSub = aStr.split(re_outer);
    for(tok in toSub) {
      var toPush = substitute(toSub[tok]);
      substituted.push(toPush);
    }
    return substituted.join('');
  },
  modifyExpressions: function(obj, root){
    var success = true;
    if("object" === typeof obj) {
      for(attr in obj){
        if("object" === typeof obj[attr]) {
          if (obj[attr].type && "expression" === obj[attr].type
              && obj[attr].expression) {
                result = jsonpath.jsonPath(root, obj[attr].expression);
                if (result && obj[attr].extract) {
                  obj[attr] = result[0];
                } else {
                  obj[attr] = result;
                  if (!result) {
                    success = false;
                  }
                }
              } else {
                if (!this.modifyExpressions(obj[attr], root)) {
                  success = false;
                }
              }
        }
      }
    }
    return success;
  },
  modifyTemplates: function(obj, root){
    var success = true;
    if("object" === typeof obj) {
      for(attr in obj){
        if("object" === typeof obj[attr]) {
          if (obj[attr].type && "template" === obj[attr].type
              && obj[attr].template) {
                result = this.parameterize(obj[attr].template, root);
                console.log('result is '+result);
                obj[attr] = result;
              } else {
                if (!this.modifyTemplates(obj[attr], root)) {
                  success = false;
                }
              }
        }
      }
    }
    return success;
  },
  modifyData: function(obj,root) {
    return this.modifyExpressions(obj, root) && this.modifyTemplates(obj, root);
  }
};

exports.Substitutions = Substitutions;
