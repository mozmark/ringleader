const {Cc, Ci, Cu} = require("chrome");
const {readURI} = require("sdk/net/url");
const {open} = require("sdk/io/file");
Cu.import("resource://gre/modules/FileUtils.jsm");

const nsX509CertDB = "@mozilla.org/security/x509certdb;1";
const nsIX509Cert = Ci.nsIX509Cert;
const nsIX509CertDB = Ci.nsIX509CertDB;
certdb = Cc[nsX509CertDB].getService(nsIX509CertDB);

var installCert = function(url) {
  // fetch data from the URL.
  readURI(url).then(function(data){
    // create a file with the data
    var file = FileUtils.getFile("TmpD", ["mitmCACert.cer"]);
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
    var writer = open(file.path,'w');
    writer.write(data);
    writer.close(data);

    // import the cert (user will be prompted to accept; this is fine, I
    // think)
    certdb.importCertsFromFile(null, file, nsIX509Cert.CA_CERT);

  }, function(error) {
    console.log('something broke');
  });
}

exports.installCert = installCert;
