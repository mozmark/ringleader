/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {jsonPath} = require("./jsonpath");

var Substitutions = {
  parameterize : function(aStr, aParams) {
    let re_outer = /(\$\{\w+\})/;
    let re_inner = /\$\{(\w+)\}/;

    let substitute = function(tok) {
      let match = tok.match(re_inner);
      if (match && match[1]) {
        if(aParams[match[1]]){
          return encodeURIComponent(aParams[match[1]]);
        }
      }
      return tok;
    };
    return Array.join([substitute(tok) for each (tok in aStr.split(re_outer))],'');
  },
  modifyExpressions: function(obj, root){
    let success = true;
    if("object" === typeof obj) {
      for(attr in obj){
        if("object" === typeof obj[attr]) {
          if (obj[attr].type && "expression" === obj[attr].type
              && obj[attr].expression) {
                result = jsonPath(root, obj[attr].expression);
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
    let success = true;
    if("object" === typeof obj) {
      for(attr in obj){
        if("object" === typeof obj[attr]) {
          if (obj[attr].type && "template" === obj[attr].type
              && obj[attr].template) {
                result = this.parameterize(obj[attr].template, obj[attr]);
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
