


//document.getElementById('h1');
//console.log(document.body.innerHTML);
// var doc = document;
// exports.doc = doc;
// someModule.js
//exports.doSomething = function() { return "foo"; };


//self.port.on("ConfigureSecTool", console.log("Configuration Started"));

self.port.on("GetDocument", function () {
  console.log('signal emitted');
  var doc = document;
  //console.log();
  //document.getElementsByTagName('html')[0].innerHTML

  self.port.emit("RecieveDocument", doc);
});