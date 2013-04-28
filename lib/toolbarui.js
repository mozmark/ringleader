// This is the old code from the original proxy record PoC and will be
// refactored away

var events = require("sdk/system/events");
var tabs_tabs = require("sdk/tabs/utils");
var window = require("sdk/window/utils");
var sdk_tabs = require("sdk/tabs");
var { Ci } = require("chrome");
const {Setup, MITM, Utils, Modifiers} = require("./mitm");
var img_rec = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB90ECA8YANsH9BoAAAAidEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVAgb24gYSBNYWOHqHdDAAAAkUlEQVQ4y8WSwQ2EMAwEByqgAyghJaVDdJWQDggd0MHywA8nJ8jphMRK+3HWY8UyvK2uLggGYAICMFp5AxKQO9gvaYJBEAWzYBXIvFot2oDb5sU11l4uIYJgU9TwrPN7APSOEXAPNypyHjDa8lqa3HILwF/ygA3IP/Rky34BkrmlItdX5E8DkiyTHzukZ0/5FR0G/mDHadJWgQAAAABJRU5ErkJggg==';
var img_stop = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB90ECA8ZFa/BIbAAAAAidEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVAgb24gYSBNYWOHqHdDAAAAH0lEQVQ4y2NgGGjAiMT+T45eJkpdMGrAqAGDw4CBBwC2SwEYgugYtwAAAABJRU5ErkJggg==';
var img_pause = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3QQIES4xFX3rLwAAACZpVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVAgb24gYSBNYWOV5F9bAAAAbElEQVQ4y9WRMQqAQAwEx/MQbOxF/+D/32PhDxTBU5utDo3goehCSJHNZpPAl7BF0QEeaIAa6KM6iHCGSTmooT0iuQtXOVBaBEtgkQB3Bbymj9aqLvXyjwrMsh5SHaxA8foKA1Bpema90/F77OcjEnLYqAxoAAAAAElFTkSuQmCC';
var img_play = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3QQIETAh3IvElAAAACZpVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVAgb24gYSBNYWOV5F9bAAAATElEQVQ4y2NgGDQgYJ3if3LkmIhVSJQB5BjCRKqTiTKAFEOYyA1YogwgxhCCBmwIus9ItgGENOM1gBjNOA0gVjNWA0jRjGEAqZqpAgBTexxVWD8wywAAAABJRU5ErkJggg==';

function getRequestWindow(request) {
    try {
        if (request.notificationCallbacks)
        return request.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    } catch(e) {}
    try {
        if(request.loadGroup && request.loadGroup.notificationCallbacks)
        return request.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    } catch(e) {}
    return null;
} 

function getTabFromChannel(channel) {
    var wnd = getRequestWindow(channel);
    return (wnd && wnd.top == wnd) ? tabs_tabs.getTabForContentWindow(wnd.top) : null;
}
 
function ProxyRecorder() {
    this.enabled = false;
    
    this.recordWidget = require("sdk/widget").Widget({
      id: "record icon",
      label: "Record",
      contentURL: img_rec,
      onClick: this.toggleRecord.bind(this)
    });
    
    this.interceptWidget = require("sdk/widget").Widget({
      id: "intercept icon",
      label: "Intercept",
      contentURL: img_pause,
      onClick: this.toggleIntercept.bind(this)
    });
    
    sdk_tabs.on('activate',this.tabChange.bind(this));
    events.on("http-on-modify-request", this.modify, true);
}

ProxyRecorder.prototype.tabChange = function (event) {
    this.showUI();
}

ProxyRecorder.prototype.modify = function (event) {
}

ProxyRecorder.prototype.activeTab = function() {
  return tabs_tabs.getActiveTab(window.getMostRecentBrowserWindow());  
};

ProxyRecorder.prototype.toggleRecord = function() {
    var key = Utils.getKeyFromTab(this.activeTab());
    var tab = this.activeTab();
    // TODO: remove old code, get state from MITM
    tab._isRecording = !tab._isRecording;
    if (tab._isRecording) {
      MITM.addModifier(Modifiers.recordModify, key);
    } else {
      MITM.removeModifier(Modifiers.recordModify, key);
    }
    this.showUI();
};

ProxyRecorder.prototype.toggleIntercept = function() {
    var key = Utils.getKeyFromTab(this.activeTab());
    // TODO: remove old code, get state from MITM
    var tab = this.activeTab();
    tab._isIntercepting = !tab._isIntercepting;
    if (tab._isIntercepting) {
      MITM.addModifier(Modifiers.interceptModify, key);
    } else {
      MITM.removeModifier(Modifiers.interceptModify, key);
    }
    this.showUI();
};

ProxyRecorder.prototype.showUI = function() {
    var tab = this.activeTab();
    if(tab._isRecording){
        this.recordWidget.contentURL = img_stop;
    } else {
        this.recordWidget.contentURL = img_rec;
    }
    if(tab._isIntercepting){
        this.interceptWidget.contentURL = img_play;
    } else {
        this.interceptWidget.contentURL = img_pause;
    }
};

exports.ProxyRecorder = ProxyRecorder;
