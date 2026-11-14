var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/mime/Mime.js
var require_Mime = __commonJS({
  "node_modules/mime/Mime.js"(exports, module) {
    "use strict";
    function Mime() {
      this._types = /* @__PURE__ */ Object.create(null);
      this._extensions = /* @__PURE__ */ Object.create(null);
      for (let i = 0; i < arguments.length; i++) {
        this.define(arguments[i]);
      }
      this.define = this.define.bind(this);
      this.getType = this.getType.bind(this);
      this.getExtension = this.getExtension.bind(this);
    }
    Mime.prototype.define = function(typeMap, force) {
      for (let type in typeMap) {
        let extensions = typeMap[type].map(function(t) {
          return t.toLowerCase();
        });
        type = type.toLowerCase();
        for (let i = 0; i < extensions.length; i++) {
          const ext = extensions[i];
          if (ext[0] === "*") {
            continue;
          }
          if (!force && ext in this._types) {
            throw new Error(
              'Attempt to change mapping for "' + ext + '" extension from "' + this._types[ext] + '" to "' + type + '". Pass `force=true` to allow this, otherwise remove "' + ext + '" from the list of extensions for "' + type + '".'
            );
          }
          this._types[ext] = type;
        }
        if (force || !this._extensions[type]) {
          const ext = extensions[0];
          this._extensions[type] = ext[0] !== "*" ? ext : ext.substr(1);
        }
      }
    };
    Mime.prototype.getType = function(path7) {
      path7 = String(path7);
      let last = path7.replace(/^.*[/\\]/, "").toLowerCase();
      let ext = last.replace(/^.*\./, "").toLowerCase();
      let hasPath = last.length < path7.length;
      let hasDot = ext.length < last.length - 1;
      return (hasDot || !hasPath) && this._types[ext] || null;
    };
    Mime.prototype.getExtension = function(type) {
      type = /^\s*([^;\s]*)/.test(type) && RegExp.$1;
      return type && this._extensions[type.toLowerCase()] || null;
    };
    module.exports = Mime;
  }
});

// node_modules/mime/types/standard.js
var require_standard = __commonJS({
  "node_modules/mime/types/standard.js"(exports, module) {
    module.exports = { "application/andrew-inset": ["ez"], "application/applixware": ["aw"], "application/atom+xml": ["atom"], "application/atomcat+xml": ["atomcat"], "application/atomdeleted+xml": ["atomdeleted"], "application/atomsvc+xml": ["atomsvc"], "application/atsc-dwd+xml": ["dwd"], "application/atsc-held+xml": ["held"], "application/atsc-rsat+xml": ["rsat"], "application/bdoc": ["bdoc"], "application/calendar+xml": ["xcs"], "application/ccxml+xml": ["ccxml"], "application/cdfx+xml": ["cdfx"], "application/cdmi-capability": ["cdmia"], "application/cdmi-container": ["cdmic"], "application/cdmi-domain": ["cdmid"], "application/cdmi-object": ["cdmio"], "application/cdmi-queue": ["cdmiq"], "application/cu-seeme": ["cu"], "application/dash+xml": ["mpd"], "application/davmount+xml": ["davmount"], "application/docbook+xml": ["dbk"], "application/dssc+der": ["dssc"], "application/dssc+xml": ["xdssc"], "application/ecmascript": ["es", "ecma"], "application/emma+xml": ["emma"], "application/emotionml+xml": ["emotionml"], "application/epub+zip": ["epub"], "application/exi": ["exi"], "application/express": ["exp"], "application/fdt+xml": ["fdt"], "application/font-tdpfr": ["pfr"], "application/geo+json": ["geojson"], "application/gml+xml": ["gml"], "application/gpx+xml": ["gpx"], "application/gxf": ["gxf"], "application/gzip": ["gz"], "application/hjson": ["hjson"], "application/hyperstudio": ["stk"], "application/inkml+xml": ["ink", "inkml"], "application/ipfix": ["ipfix"], "application/its+xml": ["its"], "application/java-archive": ["jar", "war", "ear"], "application/java-serialized-object": ["ser"], "application/java-vm": ["class"], "application/javascript": ["js", "mjs"], "application/json": ["json", "map"], "application/json5": ["json5"], "application/jsonml+json": ["jsonml"], "application/ld+json": ["jsonld"], "application/lgr+xml": ["lgr"], "application/lost+xml": ["lostxml"], "application/mac-binhex40": ["hqx"], "application/mac-compactpro": ["cpt"], "application/mads+xml": ["mads"], "application/manifest+json": ["webmanifest"], "application/marc": ["mrc"], "application/marcxml+xml": ["mrcx"], "application/mathematica": ["ma", "nb", "mb"], "application/mathml+xml": ["mathml"], "application/mbox": ["mbox"], "application/mediaservercontrol+xml": ["mscml"], "application/metalink+xml": ["metalink"], "application/metalink4+xml": ["meta4"], "application/mets+xml": ["mets"], "application/mmt-aei+xml": ["maei"], "application/mmt-usd+xml": ["musd"], "application/mods+xml": ["mods"], "application/mp21": ["m21", "mp21"], "application/mp4": ["mp4s", "m4p"], "application/msword": ["doc", "dot"], "application/mxf": ["mxf"], "application/n-quads": ["nq"], "application/n-triples": ["nt"], "application/node": ["cjs"], "application/octet-stream": ["bin", "dms", "lrf", "mar", "so", "dist", "distz", "pkg", "bpk", "dump", "elc", "deploy", "exe", "dll", "deb", "dmg", "iso", "img", "msi", "msp", "msm", "buffer"], "application/oda": ["oda"], "application/oebps-package+xml": ["opf"], "application/ogg": ["ogx"], "application/omdoc+xml": ["omdoc"], "application/onenote": ["onetoc", "onetoc2", "onetmp", "onepkg"], "application/oxps": ["oxps"], "application/p2p-overlay+xml": ["relo"], "application/patch-ops-error+xml": ["xer"], "application/pdf": ["pdf"], "application/pgp-encrypted": ["pgp"], "application/pgp-signature": ["asc", "sig"], "application/pics-rules": ["prf"], "application/pkcs10": ["p10"], "application/pkcs7-mime": ["p7m", "p7c"], "application/pkcs7-signature": ["p7s"], "application/pkcs8": ["p8"], "application/pkix-attr-cert": ["ac"], "application/pkix-cert": ["cer"], "application/pkix-crl": ["crl"], "application/pkix-pkipath": ["pkipath"], "application/pkixcmp": ["pki"], "application/pls+xml": ["pls"], "application/postscript": ["ai", "eps", "ps"], "application/provenance+xml": ["provx"], "application/pskc+xml": ["pskcxml"], "application/raml+yaml": ["raml"], "application/rdf+xml": ["rdf", "owl"], "application/reginfo+xml": ["rif"], "application/relax-ng-compact-syntax": ["rnc"], "application/resource-lists+xml": ["rl"], "application/resource-lists-diff+xml": ["rld"], "application/rls-services+xml": ["rs"], "application/route-apd+xml": ["rapd"], "application/route-s-tsid+xml": ["sls"], "application/route-usd+xml": ["rusd"], "application/rpki-ghostbusters": ["gbr"], "application/rpki-manifest": ["mft"], "application/rpki-roa": ["roa"], "application/rsd+xml": ["rsd"], "application/rss+xml": ["rss"], "application/rtf": ["rtf"], "application/sbml+xml": ["sbml"], "application/scvp-cv-request": ["scq"], "application/scvp-cv-response": ["scs"], "application/scvp-vp-request": ["spq"], "application/scvp-vp-response": ["spp"], "application/sdp": ["sdp"], "application/senml+xml": ["senmlx"], "application/sensml+xml": ["sensmlx"], "application/set-payment-initiation": ["setpay"], "application/set-registration-initiation": ["setreg"], "application/shf+xml": ["shf"], "application/sieve": ["siv", "sieve"], "application/smil+xml": ["smi", "smil"], "application/sparql-query": ["rq"], "application/sparql-results+xml": ["srx"], "application/srgs": ["gram"], "application/srgs+xml": ["grxml"], "application/sru+xml": ["sru"], "application/ssdl+xml": ["ssdl"], "application/ssml+xml": ["ssml"], "application/swid+xml": ["swidtag"], "application/tei+xml": ["tei", "teicorpus"], "application/thraud+xml": ["tfi"], "application/timestamped-data": ["tsd"], "application/toml": ["toml"], "application/trig": ["trig"], "application/ttml+xml": ["ttml"], "application/ubjson": ["ubj"], "application/urc-ressheet+xml": ["rsheet"], "application/urc-targetdesc+xml": ["td"], "application/voicexml+xml": ["vxml"], "application/wasm": ["wasm"], "application/widget": ["wgt"], "application/winhlp": ["hlp"], "application/wsdl+xml": ["wsdl"], "application/wspolicy+xml": ["wspolicy"], "application/xaml+xml": ["xaml"], "application/xcap-att+xml": ["xav"], "application/xcap-caps+xml": ["xca"], "application/xcap-diff+xml": ["xdf"], "application/xcap-el+xml": ["xel"], "application/xcap-ns+xml": ["xns"], "application/xenc+xml": ["xenc"], "application/xhtml+xml": ["xhtml", "xht"], "application/xliff+xml": ["xlf"], "application/xml": ["xml", "xsl", "xsd", "rng"], "application/xml-dtd": ["dtd"], "application/xop+xml": ["xop"], "application/xproc+xml": ["xpl"], "application/xslt+xml": ["*xsl", "xslt"], "application/xspf+xml": ["xspf"], "application/xv+xml": ["mxml", "xhvml", "xvml", "xvm"], "application/yang": ["yang"], "application/yin+xml": ["yin"], "application/zip": ["zip"], "audio/3gpp": ["*3gpp"], "audio/adpcm": ["adp"], "audio/amr": ["amr"], "audio/basic": ["au", "snd"], "audio/midi": ["mid", "midi", "kar", "rmi"], "audio/mobile-xmf": ["mxmf"], "audio/mp3": ["*mp3"], "audio/mp4": ["m4a", "mp4a"], "audio/mpeg": ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"], "audio/ogg": ["oga", "ogg", "spx", "opus"], "audio/s3m": ["s3m"], "audio/silk": ["sil"], "audio/wav": ["wav"], "audio/wave": ["*wav"], "audio/webm": ["weba"], "audio/xm": ["xm"], "font/collection": ["ttc"], "font/otf": ["otf"], "font/ttf": ["ttf"], "font/woff": ["woff"], "font/woff2": ["woff2"], "image/aces": ["exr"], "image/apng": ["apng"], "image/avif": ["avif"], "image/bmp": ["bmp"], "image/cgm": ["cgm"], "image/dicom-rle": ["drle"], "image/emf": ["emf"], "image/fits": ["fits"], "image/g3fax": ["g3"], "image/gif": ["gif"], "image/heic": ["heic"], "image/heic-sequence": ["heics"], "image/heif": ["heif"], "image/heif-sequence": ["heifs"], "image/hej2k": ["hej2"], "image/hsj2": ["hsj2"], "image/ief": ["ief"], "image/jls": ["jls"], "image/jp2": ["jp2", "jpg2"], "image/jpeg": ["jpeg", "jpg", "jpe"], "image/jph": ["jph"], "image/jphc": ["jhc"], "image/jpm": ["jpm"], "image/jpx": ["jpx", "jpf"], "image/jxr": ["jxr"], "image/jxra": ["jxra"], "image/jxrs": ["jxrs"], "image/jxs": ["jxs"], "image/jxsc": ["jxsc"], "image/jxsi": ["jxsi"], "image/jxss": ["jxss"], "image/ktx": ["ktx"], "image/ktx2": ["ktx2"], "image/png": ["png"], "image/sgi": ["sgi"], "image/svg+xml": ["svg", "svgz"], "image/t38": ["t38"], "image/tiff": ["tif", "tiff"], "image/tiff-fx": ["tfx"], "image/webp": ["webp"], "image/wmf": ["wmf"], "message/disposition-notification": ["disposition-notification"], "message/global": ["u8msg"], "message/global-delivery-status": ["u8dsn"], "message/global-disposition-notification": ["u8mdn"], "message/global-headers": ["u8hdr"], "message/rfc822": ["eml", "mime"], "model/3mf": ["3mf"], "model/gltf+json": ["gltf"], "model/gltf-binary": ["glb"], "model/iges": ["igs", "iges"], "model/mesh": ["msh", "mesh", "silo"], "model/mtl": ["mtl"], "model/obj": ["obj"], "model/step+xml": ["stpx"], "model/step+zip": ["stpz"], "model/step-xml+zip": ["stpxz"], "model/stl": ["stl"], "model/vrml": ["wrl", "vrml"], "model/x3d+binary": ["*x3db", "x3dbz"], "model/x3d+fastinfoset": ["x3db"], "model/x3d+vrml": ["*x3dv", "x3dvz"], "model/x3d+xml": ["x3d", "x3dz"], "model/x3d-vrml": ["x3dv"], "text/cache-manifest": ["appcache", "manifest"], "text/calendar": ["ics", "ifb"], "text/coffeescript": ["coffee", "litcoffee"], "text/css": ["css"], "text/csv": ["csv"], "text/html": ["html", "htm", "shtml"], "text/jade": ["jade"], "text/jsx": ["jsx"], "text/less": ["less"], "text/markdown": ["markdown", "md"], "text/mathml": ["mml"], "text/mdx": ["mdx"], "text/n3": ["n3"], "text/plain": ["txt", "text", "conf", "def", "list", "log", "in", "ini"], "text/richtext": ["rtx"], "text/rtf": ["*rtf"], "text/sgml": ["sgml", "sgm"], "text/shex": ["shex"], "text/slim": ["slim", "slm"], "text/spdx": ["spdx"], "text/stylus": ["stylus", "styl"], "text/tab-separated-values": ["tsv"], "text/troff": ["t", "tr", "roff", "man", "me", "ms"], "text/turtle": ["ttl"], "text/uri-list": ["uri", "uris", "urls"], "text/vcard": ["vcard"], "text/vtt": ["vtt"], "text/xml": ["*xml"], "text/yaml": ["yaml", "yml"], "video/3gpp": ["3gp", "3gpp"], "video/3gpp2": ["3g2"], "video/h261": ["h261"], "video/h263": ["h263"], "video/h264": ["h264"], "video/iso.segment": ["m4s"], "video/jpeg": ["jpgv"], "video/jpm": ["*jpm", "jpgm"], "video/mj2": ["mj2", "mjp2"], "video/mp2t": ["ts"], "video/mp4": ["mp4", "mp4v", "mpg4"], "video/mpeg": ["mpeg", "mpg", "mpe", "m1v", "m2v"], "video/ogg": ["ogv"], "video/quicktime": ["qt", "mov"], "video/webm": ["webm"] };
  }
});

// node_modules/mime/types/other.js
var require_other = __commonJS({
  "node_modules/mime/types/other.js"(exports, module) {
    module.exports = { "application/prs.cww": ["cww"], "application/vnd.1000minds.decision-model+xml": ["1km"], "application/vnd.3gpp.pic-bw-large": ["plb"], "application/vnd.3gpp.pic-bw-small": ["psb"], "application/vnd.3gpp.pic-bw-var": ["pvb"], "application/vnd.3gpp2.tcap": ["tcap"], "application/vnd.3m.post-it-notes": ["pwn"], "application/vnd.accpac.simply.aso": ["aso"], "application/vnd.accpac.simply.imp": ["imp"], "application/vnd.acucobol": ["acu"], "application/vnd.acucorp": ["atc", "acutc"], "application/vnd.adobe.air-application-installer-package+zip": ["air"], "application/vnd.adobe.formscentral.fcdt": ["fcdt"], "application/vnd.adobe.fxp": ["fxp", "fxpl"], "application/vnd.adobe.xdp+xml": ["xdp"], "application/vnd.adobe.xfdf": ["xfdf"], "application/vnd.ahead.space": ["ahead"], "application/vnd.airzip.filesecure.azf": ["azf"], "application/vnd.airzip.filesecure.azs": ["azs"], "application/vnd.amazon.ebook": ["azw"], "application/vnd.americandynamics.acc": ["acc"], "application/vnd.amiga.ami": ["ami"], "application/vnd.android.package-archive": ["apk"], "application/vnd.anser-web-certificate-issue-initiation": ["cii"], "application/vnd.anser-web-funds-transfer-initiation": ["fti"], "application/vnd.antix.game-component": ["atx"], "application/vnd.apple.installer+xml": ["mpkg"], "application/vnd.apple.keynote": ["key"], "application/vnd.apple.mpegurl": ["m3u8"], "application/vnd.apple.numbers": ["numbers"], "application/vnd.apple.pages": ["pages"], "application/vnd.apple.pkpass": ["pkpass"], "application/vnd.aristanetworks.swi": ["swi"], "application/vnd.astraea-software.iota": ["iota"], "application/vnd.audiograph": ["aep"], "application/vnd.balsamiq.bmml+xml": ["bmml"], "application/vnd.blueice.multipass": ["mpm"], "application/vnd.bmi": ["bmi"], "application/vnd.businessobjects": ["rep"], "application/vnd.chemdraw+xml": ["cdxml"], "application/vnd.chipnuts.karaoke-mmd": ["mmd"], "application/vnd.cinderella": ["cdy"], "application/vnd.citationstyles.style+xml": ["csl"], "application/vnd.claymore": ["cla"], "application/vnd.cloanto.rp9": ["rp9"], "application/vnd.clonk.c4group": ["c4g", "c4d", "c4f", "c4p", "c4u"], "application/vnd.cluetrust.cartomobile-config": ["c11amc"], "application/vnd.cluetrust.cartomobile-config-pkg": ["c11amz"], "application/vnd.commonspace": ["csp"], "application/vnd.contact.cmsg": ["cdbcmsg"], "application/vnd.cosmocaller": ["cmc"], "application/vnd.crick.clicker": ["clkx"], "application/vnd.crick.clicker.keyboard": ["clkk"], "application/vnd.crick.clicker.palette": ["clkp"], "application/vnd.crick.clicker.template": ["clkt"], "application/vnd.crick.clicker.wordbank": ["clkw"], "application/vnd.criticaltools.wbs+xml": ["wbs"], "application/vnd.ctc-posml": ["pml"], "application/vnd.cups-ppd": ["ppd"], "application/vnd.curl.car": ["car"], "application/vnd.curl.pcurl": ["pcurl"], "application/vnd.dart": ["dart"], "application/vnd.data-vision.rdz": ["rdz"], "application/vnd.dbf": ["dbf"], "application/vnd.dece.data": ["uvf", "uvvf", "uvd", "uvvd"], "application/vnd.dece.ttml+xml": ["uvt", "uvvt"], "application/vnd.dece.unspecified": ["uvx", "uvvx"], "application/vnd.dece.zip": ["uvz", "uvvz"], "application/vnd.denovo.fcselayout-link": ["fe_launch"], "application/vnd.dna": ["dna"], "application/vnd.dolby.mlp": ["mlp"], "application/vnd.dpgraph": ["dpg"], "application/vnd.dreamfactory": ["dfac"], "application/vnd.ds-keypoint": ["kpxx"], "application/vnd.dvb.ait": ["ait"], "application/vnd.dvb.service": ["svc"], "application/vnd.dynageo": ["geo"], "application/vnd.ecowin.chart": ["mag"], "application/vnd.enliven": ["nml"], "application/vnd.epson.esf": ["esf"], "application/vnd.epson.msf": ["msf"], "application/vnd.epson.quickanime": ["qam"], "application/vnd.epson.salt": ["slt"], "application/vnd.epson.ssf": ["ssf"], "application/vnd.eszigno3+xml": ["es3", "et3"], "application/vnd.ezpix-album": ["ez2"], "application/vnd.ezpix-package": ["ez3"], "application/vnd.fdf": ["fdf"], "application/vnd.fdsn.mseed": ["mseed"], "application/vnd.fdsn.seed": ["seed", "dataless"], "application/vnd.flographit": ["gph"], "application/vnd.fluxtime.clip": ["ftc"], "application/vnd.framemaker": ["fm", "frame", "maker", "book"], "application/vnd.frogans.fnc": ["fnc"], "application/vnd.frogans.ltf": ["ltf"], "application/vnd.fsc.weblaunch": ["fsc"], "application/vnd.fujitsu.oasys": ["oas"], "application/vnd.fujitsu.oasys2": ["oa2"], "application/vnd.fujitsu.oasys3": ["oa3"], "application/vnd.fujitsu.oasysgp": ["fg5"], "application/vnd.fujitsu.oasysprs": ["bh2"], "application/vnd.fujixerox.ddd": ["ddd"], "application/vnd.fujixerox.docuworks": ["xdw"], "application/vnd.fujixerox.docuworks.binder": ["xbd"], "application/vnd.fuzzysheet": ["fzs"], "application/vnd.genomatix.tuxedo": ["txd"], "application/vnd.geogebra.file": ["ggb"], "application/vnd.geogebra.tool": ["ggt"], "application/vnd.geometry-explorer": ["gex", "gre"], "application/vnd.geonext": ["gxt"], "application/vnd.geoplan": ["g2w"], "application/vnd.geospace": ["g3w"], "application/vnd.gmx": ["gmx"], "application/vnd.google-apps.document": ["gdoc"], "application/vnd.google-apps.presentation": ["gslides"], "application/vnd.google-apps.spreadsheet": ["gsheet"], "application/vnd.google-earth.kml+xml": ["kml"], "application/vnd.google-earth.kmz": ["kmz"], "application/vnd.grafeq": ["gqf", "gqs"], "application/vnd.groove-account": ["gac"], "application/vnd.groove-help": ["ghf"], "application/vnd.groove-identity-message": ["gim"], "application/vnd.groove-injector": ["grv"], "application/vnd.groove-tool-message": ["gtm"], "application/vnd.groove-tool-template": ["tpl"], "application/vnd.groove-vcard": ["vcg"], "application/vnd.hal+xml": ["hal"], "application/vnd.handheld-entertainment+xml": ["zmm"], "application/vnd.hbci": ["hbci"], "application/vnd.hhe.lesson-player": ["les"], "application/vnd.hp-hpgl": ["hpgl"], "application/vnd.hp-hpid": ["hpid"], "application/vnd.hp-hps": ["hps"], "application/vnd.hp-jlyt": ["jlt"], "application/vnd.hp-pcl": ["pcl"], "application/vnd.hp-pclxl": ["pclxl"], "application/vnd.hydrostatix.sof-data": ["sfd-hdstx"], "application/vnd.ibm.minipay": ["mpy"], "application/vnd.ibm.modcap": ["afp", "listafp", "list3820"], "application/vnd.ibm.rights-management": ["irm"], "application/vnd.ibm.secure-container": ["sc"], "application/vnd.iccprofile": ["icc", "icm"], "application/vnd.igloader": ["igl"], "application/vnd.immervision-ivp": ["ivp"], "application/vnd.immervision-ivu": ["ivu"], "application/vnd.insors.igm": ["igm"], "application/vnd.intercon.formnet": ["xpw", "xpx"], "application/vnd.intergeo": ["i2g"], "application/vnd.intu.qbo": ["qbo"], "application/vnd.intu.qfx": ["qfx"], "application/vnd.ipunplugged.rcprofile": ["rcprofile"], "application/vnd.irepository.package+xml": ["irp"], "application/vnd.is-xpr": ["xpr"], "application/vnd.isac.fcs": ["fcs"], "application/vnd.jam": ["jam"], "application/vnd.jcp.javame.midlet-rms": ["rms"], "application/vnd.jisp": ["jisp"], "application/vnd.joost.joda-archive": ["joda"], "application/vnd.kahootz": ["ktz", "ktr"], "application/vnd.kde.karbon": ["karbon"], "application/vnd.kde.kchart": ["chrt"], "application/vnd.kde.kformula": ["kfo"], "application/vnd.kde.kivio": ["flw"], "application/vnd.kde.kontour": ["kon"], "application/vnd.kde.kpresenter": ["kpr", "kpt"], "application/vnd.kde.kspread": ["ksp"], "application/vnd.kde.kword": ["kwd", "kwt"], "application/vnd.kenameaapp": ["htke"], "application/vnd.kidspiration": ["kia"], "application/vnd.kinar": ["kne", "knp"], "application/vnd.koan": ["skp", "skd", "skt", "skm"], "application/vnd.kodak-descriptor": ["sse"], "application/vnd.las.las+xml": ["lasxml"], "application/vnd.llamagraphics.life-balance.desktop": ["lbd"], "application/vnd.llamagraphics.life-balance.exchange+xml": ["lbe"], "application/vnd.lotus-1-2-3": ["123"], "application/vnd.lotus-approach": ["apr"], "application/vnd.lotus-freelance": ["pre"], "application/vnd.lotus-notes": ["nsf"], "application/vnd.lotus-organizer": ["org"], "application/vnd.lotus-screencam": ["scm"], "application/vnd.lotus-wordpro": ["lwp"], "application/vnd.macports.portpkg": ["portpkg"], "application/vnd.mapbox-vector-tile": ["mvt"], "application/vnd.mcd": ["mcd"], "application/vnd.medcalcdata": ["mc1"], "application/vnd.mediastation.cdkey": ["cdkey"], "application/vnd.mfer": ["mwf"], "application/vnd.mfmp": ["mfm"], "application/vnd.micrografx.flo": ["flo"], "application/vnd.micrografx.igx": ["igx"], "application/vnd.mif": ["mif"], "application/vnd.mobius.daf": ["daf"], "application/vnd.mobius.dis": ["dis"], "application/vnd.mobius.mbk": ["mbk"], "application/vnd.mobius.mqy": ["mqy"], "application/vnd.mobius.msl": ["msl"], "application/vnd.mobius.plc": ["plc"], "application/vnd.mobius.txf": ["txf"], "application/vnd.mophun.application": ["mpn"], "application/vnd.mophun.certificate": ["mpc"], "application/vnd.mozilla.xul+xml": ["xul"], "application/vnd.ms-artgalry": ["cil"], "application/vnd.ms-cab-compressed": ["cab"], "application/vnd.ms-excel": ["xls", "xlm", "xla", "xlc", "xlt", "xlw"], "application/vnd.ms-excel.addin.macroenabled.12": ["xlam"], "application/vnd.ms-excel.sheet.binary.macroenabled.12": ["xlsb"], "application/vnd.ms-excel.sheet.macroenabled.12": ["xlsm"], "application/vnd.ms-excel.template.macroenabled.12": ["xltm"], "application/vnd.ms-fontobject": ["eot"], "application/vnd.ms-htmlhelp": ["chm"], "application/vnd.ms-ims": ["ims"], "application/vnd.ms-lrm": ["lrm"], "application/vnd.ms-officetheme": ["thmx"], "application/vnd.ms-outlook": ["msg"], "application/vnd.ms-pki.seccat": ["cat"], "application/vnd.ms-pki.stl": ["*stl"], "application/vnd.ms-powerpoint": ["ppt", "pps", "pot"], "application/vnd.ms-powerpoint.addin.macroenabled.12": ["ppam"], "application/vnd.ms-powerpoint.presentation.macroenabled.12": ["pptm"], "application/vnd.ms-powerpoint.slide.macroenabled.12": ["sldm"], "application/vnd.ms-powerpoint.slideshow.macroenabled.12": ["ppsm"], "application/vnd.ms-powerpoint.template.macroenabled.12": ["potm"], "application/vnd.ms-project": ["mpp", "mpt"], "application/vnd.ms-word.document.macroenabled.12": ["docm"], "application/vnd.ms-word.template.macroenabled.12": ["dotm"], "application/vnd.ms-works": ["wps", "wks", "wcm", "wdb"], "application/vnd.ms-wpl": ["wpl"], "application/vnd.ms-xpsdocument": ["xps"], "application/vnd.mseq": ["mseq"], "application/vnd.musician": ["mus"], "application/vnd.muvee.style": ["msty"], "application/vnd.mynfc": ["taglet"], "application/vnd.neurolanguage.nlu": ["nlu"], "application/vnd.nitf": ["ntf", "nitf"], "application/vnd.noblenet-directory": ["nnd"], "application/vnd.noblenet-sealer": ["nns"], "application/vnd.noblenet-web": ["nnw"], "application/vnd.nokia.n-gage.ac+xml": ["*ac"], "application/vnd.nokia.n-gage.data": ["ngdat"], "application/vnd.nokia.n-gage.symbian.install": ["n-gage"], "application/vnd.nokia.radio-preset": ["rpst"], "application/vnd.nokia.radio-presets": ["rpss"], "application/vnd.novadigm.edm": ["edm"], "application/vnd.novadigm.edx": ["edx"], "application/vnd.novadigm.ext": ["ext"], "application/vnd.oasis.opendocument.chart": ["odc"], "application/vnd.oasis.opendocument.chart-template": ["otc"], "application/vnd.oasis.opendocument.database": ["odb"], "application/vnd.oasis.opendocument.formula": ["odf"], "application/vnd.oasis.opendocument.formula-template": ["odft"], "application/vnd.oasis.opendocument.graphics": ["odg"], "application/vnd.oasis.opendocument.graphics-template": ["otg"], "application/vnd.oasis.opendocument.image": ["odi"], "application/vnd.oasis.opendocument.image-template": ["oti"], "application/vnd.oasis.opendocument.presentation": ["odp"], "application/vnd.oasis.opendocument.presentation-template": ["otp"], "application/vnd.oasis.opendocument.spreadsheet": ["ods"], "application/vnd.oasis.opendocument.spreadsheet-template": ["ots"], "application/vnd.oasis.opendocument.text": ["odt"], "application/vnd.oasis.opendocument.text-master": ["odm"], "application/vnd.oasis.opendocument.text-template": ["ott"], "application/vnd.oasis.opendocument.text-web": ["oth"], "application/vnd.olpc-sugar": ["xo"], "application/vnd.oma.dd2+xml": ["dd2"], "application/vnd.openblox.game+xml": ["obgx"], "application/vnd.openofficeorg.extension": ["oxt"], "application/vnd.openstreetmap.data+xml": ["osm"], "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"], "application/vnd.openxmlformats-officedocument.presentationml.slide": ["sldx"], "application/vnd.openxmlformats-officedocument.presentationml.slideshow": ["ppsx"], "application/vnd.openxmlformats-officedocument.presentationml.template": ["potx"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"], "application/vnd.openxmlformats-officedocument.spreadsheetml.template": ["xltx"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"], "application/vnd.openxmlformats-officedocument.wordprocessingml.template": ["dotx"], "application/vnd.osgeo.mapguide.package": ["mgp"], "application/vnd.osgi.dp": ["dp"], "application/vnd.osgi.subsystem": ["esa"], "application/vnd.palm": ["pdb", "pqa", "oprc"], "application/vnd.pawaafile": ["paw"], "application/vnd.pg.format": ["str"], "application/vnd.pg.osasli": ["ei6"], "application/vnd.picsel": ["efif"], "application/vnd.pmi.widget": ["wg"], "application/vnd.pocketlearn": ["plf"], "application/vnd.powerbuilder6": ["pbd"], "application/vnd.previewsystems.box": ["box"], "application/vnd.proteus.magazine": ["mgz"], "application/vnd.publishare-delta-tree": ["qps"], "application/vnd.pvi.ptid1": ["ptid"], "application/vnd.quark.quarkxpress": ["qxd", "qxt", "qwd", "qwt", "qxl", "qxb"], "application/vnd.rar": ["rar"], "application/vnd.realvnc.bed": ["bed"], "application/vnd.recordare.musicxml": ["mxl"], "application/vnd.recordare.musicxml+xml": ["musicxml"], "application/vnd.rig.cryptonote": ["cryptonote"], "application/vnd.rim.cod": ["cod"], "application/vnd.rn-realmedia": ["rm"], "application/vnd.rn-realmedia-vbr": ["rmvb"], "application/vnd.route66.link66+xml": ["link66"], "application/vnd.sailingtracker.track": ["st"], "application/vnd.seemail": ["see"], "application/vnd.sema": ["sema"], "application/vnd.semd": ["semd"], "application/vnd.semf": ["semf"], "application/vnd.shana.informed.formdata": ["ifm"], "application/vnd.shana.informed.formtemplate": ["itp"], "application/vnd.shana.informed.interchange": ["iif"], "application/vnd.shana.informed.package": ["ipk"], "application/vnd.simtech-mindmapper": ["twd", "twds"], "application/vnd.smaf": ["mmf"], "application/vnd.smart.teacher": ["teacher"], "application/vnd.software602.filler.form+xml": ["fo"], "application/vnd.solent.sdkm+xml": ["sdkm", "sdkd"], "application/vnd.spotfire.dxp": ["dxp"], "application/vnd.spotfire.sfs": ["sfs"], "application/vnd.stardivision.calc": ["sdc"], "application/vnd.stardivision.draw": ["sda"], "application/vnd.stardivision.impress": ["sdd"], "application/vnd.stardivision.math": ["smf"], "application/vnd.stardivision.writer": ["sdw", "vor"], "application/vnd.stardivision.writer-global": ["sgl"], "application/vnd.stepmania.package": ["smzip"], "application/vnd.stepmania.stepchart": ["sm"], "application/vnd.sun.wadl+xml": ["wadl"], "application/vnd.sun.xml.calc": ["sxc"], "application/vnd.sun.xml.calc.template": ["stc"], "application/vnd.sun.xml.draw": ["sxd"], "application/vnd.sun.xml.draw.template": ["std"], "application/vnd.sun.xml.impress": ["sxi"], "application/vnd.sun.xml.impress.template": ["sti"], "application/vnd.sun.xml.math": ["sxm"], "application/vnd.sun.xml.writer": ["sxw"], "application/vnd.sun.xml.writer.global": ["sxg"], "application/vnd.sun.xml.writer.template": ["stw"], "application/vnd.sus-calendar": ["sus", "susp"], "application/vnd.svd": ["svd"], "application/vnd.symbian.install": ["sis", "sisx"], "application/vnd.syncml+xml": ["xsm"], "application/vnd.syncml.dm+wbxml": ["bdm"], "application/vnd.syncml.dm+xml": ["xdm"], "application/vnd.syncml.dmddf+xml": ["ddf"], "application/vnd.tao.intent-module-archive": ["tao"], "application/vnd.tcpdump.pcap": ["pcap", "cap", "dmp"], "application/vnd.tmobile-livetv": ["tmo"], "application/vnd.trid.tpt": ["tpt"], "application/vnd.triscape.mxs": ["mxs"], "application/vnd.trueapp": ["tra"], "application/vnd.ufdl": ["ufd", "ufdl"], "application/vnd.uiq.theme": ["utz"], "application/vnd.umajin": ["umj"], "application/vnd.unity": ["unityweb"], "application/vnd.uoml+xml": ["uoml"], "application/vnd.vcx": ["vcx"], "application/vnd.visio": ["vsd", "vst", "vss", "vsw"], "application/vnd.visionary": ["vis"], "application/vnd.vsf": ["vsf"], "application/vnd.wap.wbxml": ["wbxml"], "application/vnd.wap.wmlc": ["wmlc"], "application/vnd.wap.wmlscriptc": ["wmlsc"], "application/vnd.webturbo": ["wtb"], "application/vnd.wolfram.player": ["nbp"], "application/vnd.wordperfect": ["wpd"], "application/vnd.wqd": ["wqd"], "application/vnd.wt.stf": ["stf"], "application/vnd.xara": ["xar"], "application/vnd.xfdl": ["xfdl"], "application/vnd.yamaha.hv-dic": ["hvd"], "application/vnd.yamaha.hv-script": ["hvs"], "application/vnd.yamaha.hv-voice": ["hvp"], "application/vnd.yamaha.openscoreformat": ["osf"], "application/vnd.yamaha.openscoreformat.osfpvg+xml": ["osfpvg"], "application/vnd.yamaha.smaf-audio": ["saf"], "application/vnd.yamaha.smaf-phrase": ["spf"], "application/vnd.yellowriver-custom-menu": ["cmp"], "application/vnd.zul": ["zir", "zirz"], "application/vnd.zzazz.deck+xml": ["zaz"], "application/x-7z-compressed": ["7z"], "application/x-abiword": ["abw"], "application/x-ace-compressed": ["ace"], "application/x-apple-diskimage": ["*dmg"], "application/x-arj": ["arj"], "application/x-authorware-bin": ["aab", "x32", "u32", "vox"], "application/x-authorware-map": ["aam"], "application/x-authorware-seg": ["aas"], "application/x-bcpio": ["bcpio"], "application/x-bdoc": ["*bdoc"], "application/x-bittorrent": ["torrent"], "application/x-blorb": ["blb", "blorb"], "application/x-bzip": ["bz"], "application/x-bzip2": ["bz2", "boz"], "application/x-cbr": ["cbr", "cba", "cbt", "cbz", "cb7"], "application/x-cdlink": ["vcd"], "application/x-cfs-compressed": ["cfs"], "application/x-chat": ["chat"], "application/x-chess-pgn": ["pgn"], "application/x-chrome-extension": ["crx"], "application/x-cocoa": ["cco"], "application/x-conference": ["nsc"], "application/x-cpio": ["cpio"], "application/x-csh": ["csh"], "application/x-debian-package": ["*deb", "udeb"], "application/x-dgc-compressed": ["dgc"], "application/x-director": ["dir", "dcr", "dxr", "cst", "cct", "cxt", "w3d", "fgd", "swa"], "application/x-doom": ["wad"], "application/x-dtbncx+xml": ["ncx"], "application/x-dtbook+xml": ["dtb"], "application/x-dtbresource+xml": ["res"], "application/x-dvi": ["dvi"], "application/x-envoy": ["evy"], "application/x-eva": ["eva"], "application/x-font-bdf": ["bdf"], "application/x-font-ghostscript": ["gsf"], "application/x-font-linux-psf": ["psf"], "application/x-font-pcf": ["pcf"], "application/x-font-snf": ["snf"], "application/x-font-type1": ["pfa", "pfb", "pfm", "afm"], "application/x-freearc": ["arc"], "application/x-futuresplash": ["spl"], "application/x-gca-compressed": ["gca"], "application/x-glulx": ["ulx"], "application/x-gnumeric": ["gnumeric"], "application/x-gramps-xml": ["gramps"], "application/x-gtar": ["gtar"], "application/x-hdf": ["hdf"], "application/x-httpd-php": ["php"], "application/x-install-instructions": ["install"], "application/x-iso9660-image": ["*iso"], "application/x-iwork-keynote-sffkey": ["*key"], "application/x-iwork-numbers-sffnumbers": ["*numbers"], "application/x-iwork-pages-sffpages": ["*pages"], "application/x-java-archive-diff": ["jardiff"], "application/x-java-jnlp-file": ["jnlp"], "application/x-keepass2": ["kdbx"], "application/x-latex": ["latex"], "application/x-lua-bytecode": ["luac"], "application/x-lzh-compressed": ["lzh", "lha"], "application/x-makeself": ["run"], "application/x-mie": ["mie"], "application/x-mobipocket-ebook": ["prc", "mobi"], "application/x-ms-application": ["application"], "application/x-ms-shortcut": ["lnk"], "application/x-ms-wmd": ["wmd"], "application/x-ms-wmz": ["wmz"], "application/x-ms-xbap": ["xbap"], "application/x-msaccess": ["mdb"], "application/x-msbinder": ["obd"], "application/x-mscardfile": ["crd"], "application/x-msclip": ["clp"], "application/x-msdos-program": ["*exe"], "application/x-msdownload": ["*exe", "*dll", "com", "bat", "*msi"], "application/x-msmediaview": ["mvb", "m13", "m14"], "application/x-msmetafile": ["*wmf", "*wmz", "*emf", "emz"], "application/x-msmoney": ["mny"], "application/x-mspublisher": ["pub"], "application/x-msschedule": ["scd"], "application/x-msterminal": ["trm"], "application/x-mswrite": ["wri"], "application/x-netcdf": ["nc", "cdf"], "application/x-ns-proxy-autoconfig": ["pac"], "application/x-nzb": ["nzb"], "application/x-perl": ["pl", "pm"], "application/x-pilot": ["*prc", "*pdb"], "application/x-pkcs12": ["p12", "pfx"], "application/x-pkcs7-certificates": ["p7b", "spc"], "application/x-pkcs7-certreqresp": ["p7r"], "application/x-rar-compressed": ["*rar"], "application/x-redhat-package-manager": ["rpm"], "application/x-research-info-systems": ["ris"], "application/x-sea": ["sea"], "application/x-sh": ["sh"], "application/x-shar": ["shar"], "application/x-shockwave-flash": ["swf"], "application/x-silverlight-app": ["xap"], "application/x-sql": ["sql"], "application/x-stuffit": ["sit"], "application/x-stuffitx": ["sitx"], "application/x-subrip": ["srt"], "application/x-sv4cpio": ["sv4cpio"], "application/x-sv4crc": ["sv4crc"], "application/x-t3vm-image": ["t3"], "application/x-tads": ["gam"], "application/x-tar": ["tar"], "application/x-tcl": ["tcl", "tk"], "application/x-tex": ["tex"], "application/x-tex-tfm": ["tfm"], "application/x-texinfo": ["texinfo", "texi"], "application/x-tgif": ["*obj"], "application/x-ustar": ["ustar"], "application/x-virtualbox-hdd": ["hdd"], "application/x-virtualbox-ova": ["ova"], "application/x-virtualbox-ovf": ["ovf"], "application/x-virtualbox-vbox": ["vbox"], "application/x-virtualbox-vbox-extpack": ["vbox-extpack"], "application/x-virtualbox-vdi": ["vdi"], "application/x-virtualbox-vhd": ["vhd"], "application/x-virtualbox-vmdk": ["vmdk"], "application/x-wais-source": ["src"], "application/x-web-app-manifest+json": ["webapp"], "application/x-x509-ca-cert": ["der", "crt", "pem"], "application/x-xfig": ["fig"], "application/x-xliff+xml": ["*xlf"], "application/x-xpinstall": ["xpi"], "application/x-xz": ["xz"], "application/x-zmachine": ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8"], "audio/vnd.dece.audio": ["uva", "uvva"], "audio/vnd.digital-winds": ["eol"], "audio/vnd.dra": ["dra"], "audio/vnd.dts": ["dts"], "audio/vnd.dts.hd": ["dtshd"], "audio/vnd.lucent.voice": ["lvp"], "audio/vnd.ms-playready.media.pya": ["pya"], "audio/vnd.nuera.ecelp4800": ["ecelp4800"], "audio/vnd.nuera.ecelp7470": ["ecelp7470"], "audio/vnd.nuera.ecelp9600": ["ecelp9600"], "audio/vnd.rip": ["rip"], "audio/x-aac": ["aac"], "audio/x-aiff": ["aif", "aiff", "aifc"], "audio/x-caf": ["caf"], "audio/x-flac": ["flac"], "audio/x-m4a": ["*m4a"], "audio/x-matroska": ["mka"], "audio/x-mpegurl": ["m3u"], "audio/x-ms-wax": ["wax"], "audio/x-ms-wma": ["wma"], "audio/x-pn-realaudio": ["ram", "ra"], "audio/x-pn-realaudio-plugin": ["rmp"], "audio/x-realaudio": ["*ra"], "audio/x-wav": ["*wav"], "chemical/x-cdx": ["cdx"], "chemical/x-cif": ["cif"], "chemical/x-cmdf": ["cmdf"], "chemical/x-cml": ["cml"], "chemical/x-csml": ["csml"], "chemical/x-xyz": ["xyz"], "image/prs.btif": ["btif"], "image/prs.pti": ["pti"], "image/vnd.adobe.photoshop": ["psd"], "image/vnd.airzip.accelerator.azv": ["azv"], "image/vnd.dece.graphic": ["uvi", "uvvi", "uvg", "uvvg"], "image/vnd.djvu": ["djvu", "djv"], "image/vnd.dvb.subtitle": ["*sub"], "image/vnd.dwg": ["dwg"], "image/vnd.dxf": ["dxf"], "image/vnd.fastbidsheet": ["fbs"], "image/vnd.fpx": ["fpx"], "image/vnd.fst": ["fst"], "image/vnd.fujixerox.edmics-mmr": ["mmr"], "image/vnd.fujixerox.edmics-rlc": ["rlc"], "image/vnd.microsoft.icon": ["ico"], "image/vnd.ms-dds": ["dds"], "image/vnd.ms-modi": ["mdi"], "image/vnd.ms-photo": ["wdp"], "image/vnd.net-fpx": ["npx"], "image/vnd.pco.b16": ["b16"], "image/vnd.tencent.tap": ["tap"], "image/vnd.valve.source.texture": ["vtf"], "image/vnd.wap.wbmp": ["wbmp"], "image/vnd.xiff": ["xif"], "image/vnd.zbrush.pcx": ["pcx"], "image/x-3ds": ["3ds"], "image/x-cmu-raster": ["ras"], "image/x-cmx": ["cmx"], "image/x-freehand": ["fh", "fhc", "fh4", "fh5", "fh7"], "image/x-icon": ["*ico"], "image/x-jng": ["jng"], "image/x-mrsid-image": ["sid"], "image/x-ms-bmp": ["*bmp"], "image/x-pcx": ["*pcx"], "image/x-pict": ["pic", "pct"], "image/x-portable-anymap": ["pnm"], "image/x-portable-bitmap": ["pbm"], "image/x-portable-graymap": ["pgm"], "image/x-portable-pixmap": ["ppm"], "image/x-rgb": ["rgb"], "image/x-tga": ["tga"], "image/x-xbitmap": ["xbm"], "image/x-xpixmap": ["xpm"], "image/x-xwindowdump": ["xwd"], "message/vnd.wfa.wsc": ["wsc"], "model/vnd.collada+xml": ["dae"], "model/vnd.dwf": ["dwf"], "model/vnd.gdl": ["gdl"], "model/vnd.gtw": ["gtw"], "model/vnd.mts": ["mts"], "model/vnd.opengex": ["ogex"], "model/vnd.parasolid.transmit.binary": ["x_b"], "model/vnd.parasolid.transmit.text": ["x_t"], "model/vnd.sap.vds": ["vds"], "model/vnd.usdz+zip": ["usdz"], "model/vnd.valve.source.compiled-map": ["bsp"], "model/vnd.vtu": ["vtu"], "text/prs.lines.tag": ["dsc"], "text/vnd.curl": ["curl"], "text/vnd.curl.dcurl": ["dcurl"], "text/vnd.curl.mcurl": ["mcurl"], "text/vnd.curl.scurl": ["scurl"], "text/vnd.dvb.subtitle": ["sub"], "text/vnd.fly": ["fly"], "text/vnd.fmi.flexstor": ["flx"], "text/vnd.graphviz": ["gv"], "text/vnd.in3d.3dml": ["3dml"], "text/vnd.in3d.spot": ["spot"], "text/vnd.sun.j2me.app-descriptor": ["jad"], "text/vnd.wap.wml": ["wml"], "text/vnd.wap.wmlscript": ["wmls"], "text/x-asm": ["s", "asm"], "text/x-c": ["c", "cc", "cxx", "cpp", "h", "hh", "dic"], "text/x-component": ["htc"], "text/x-fortran": ["f", "for", "f77", "f90"], "text/x-handlebars-template": ["hbs"], "text/x-java-source": ["java"], "text/x-lua": ["lua"], "text/x-markdown": ["mkd"], "text/x-nfo": ["nfo"], "text/x-opml": ["opml"], "text/x-org": ["*org"], "text/x-pascal": ["p", "pas"], "text/x-processing": ["pde"], "text/x-sass": ["sass"], "text/x-scss": ["scss"], "text/x-setext": ["etx"], "text/x-sfv": ["sfv"], "text/x-suse-ymp": ["ymp"], "text/x-uuencode": ["uu"], "text/x-vcalendar": ["vcs"], "text/x-vcard": ["vcf"], "video/vnd.dece.hd": ["uvh", "uvvh"], "video/vnd.dece.mobile": ["uvm", "uvvm"], "video/vnd.dece.pd": ["uvp", "uvvp"], "video/vnd.dece.sd": ["uvs", "uvvs"], "video/vnd.dece.video": ["uvv", "uvvv"], "video/vnd.dvb.file": ["dvb"], "video/vnd.fvt": ["fvt"], "video/vnd.mpegurl": ["mxu", "m4u"], "video/vnd.ms-playready.media.pyv": ["pyv"], "video/vnd.uvvu.mp4": ["uvu", "uvvu"], "video/vnd.vivo": ["viv"], "video/x-f4v": ["f4v"], "video/x-fli": ["fli"], "video/x-flv": ["flv"], "video/x-m4v": ["m4v"], "video/x-matroska": ["mkv", "mk3d", "mks"], "video/x-mng": ["mng"], "video/x-ms-asf": ["asf", "asx"], "video/x-ms-vob": ["vob"], "video/x-ms-wm": ["wm"], "video/x-ms-wmv": ["wmv"], "video/x-ms-wmx": ["wmx"], "video/x-ms-wvx": ["wvx"], "video/x-msvideo": ["avi"], "video/x-sgi-movie": ["movie"], "video/x-smv": ["smv"], "x-conference/x-cooltalk": ["ice"] };
  }
});

// node_modules/mime/index.js
var require_mime = __commonJS({
  "node_modules/mime/index.js"(exports, module) {
    "use strict";
    var Mime = require_Mime();
    module.exports = new Mime(require_standard(), require_other());
  }
});

// scripts/engine/engine-paths.mjs
import path3 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function d1DiskPath(dataDir) {
  return path3.join(dataDir, "d1");
}
function d1SqlitePath(dataDir) {
  return path3.join(
    d1DiskPath(dataDir),
    D1_UNIQUE_KEY2,
    "1ef2f391686e9f4a0ebc89b6b39d804aa83ca44ebdd90d82e5b605c183c4fa6c.sqlite"
  );
}
var REPO_ROOT2, D1_OBJECT_CLASS2, D1_UNIQUE_KEY2;
var init_engine_paths = __esm({
  "scripts/engine/engine-paths.mjs"() {
    "use strict";
    REPO_ROOT2 = path3.resolve(path3.dirname(fileURLToPath2(import.meta.url)), "../..");
    D1_OBJECT_CLASS2 = "D1DatabaseObject";
    D1_UNIQUE_KEY2 = `miniflare-${D1_OBJECT_CLASS2}`;
  }
});

// scripts/engine/seed-demo.mjs
var seed_demo_exports = {};
__export(seed_demo_exports, {
  seedDemo: () => seedDemo
});
import { mkdirSync as mkdirSync3 } from "node:fs";
import path5 from "node:path";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { DatabaseSync as DatabaseSync4 } from "node:sqlite";
function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, DERIVED_BITS / 8, "sha256");
  const b64 = (buf) => buf.toString("base64");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}
function seedDemo(dbPath) {
  mkdirSync3(path5.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync4(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.prepare(`INSERT INTO settings (key, value) VALUES ('clinic_name', ?)
              ON CONFLICT(key) DO NOTHING`).run(JSON.stringify("مرکز نمونه"));
  db.prepare(`INSERT INTO settings (key, value) VALUES ('sys_auth_secret', ?)
              ON CONFLICT(key) DO NOTHING`).run(JSON.stringify(`demo-${randomBytes(24).toString("hex")}`));
  const insertUser = db.prepare(`INSERT OR IGNORE INTO staff (id, email, full_name, role, active, username, password_hash)
    VALUES (?, ?, ?, ?, 1, ?, ?)`);
  let usersCreated = 0;
  for (const u of DEMO_USERS) {
    const r = insertUser.run(u.id, u.email, u.full_name, u.role, u.username, hashPassword(DEMO_PASSWORD));
    usersCreated += Number(r.changes);
  }
  db.prepare(`UPDATE staff SET active = 1 WHERE id IN (${DEMO_USERS.map(() => "?").join(",")})`).run(...DEMO_USERS.map((u) => u.id));
  db.prepare(`INSERT OR IGNORE INTO schools (id, name, kind, active) VALUES (?, ?, 'school', 1)`).run("40000000-0000-4000-8000-000000000401", "دبستان نمونه");
  const insertStudent = db.prepare(`INSERT OR IGNORE INTO students
    (id, national_id, first_name, last_name, gender, grade, school_id, guardian_name, guardian_relation, guardian_phone, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  insertStudent.run("50000000-0000-4000-8000-000000000501", "5000010101", "امیر", "رضایی", "male", "سه", "40000000-0000-4000-8000-000000000401", "حسین رضایی", "پدر", "09121110501");
  insertStudent.run("50000000-0000-4000-8000-000000000502", "5000010102", "سارا", "محمدی", "female", "چهارم", "40000000-0000-4000-8000-000000000401", "مریم محمدی", "مادر", "09121110502");
  db.close();
  return { usersCreated };
}
var DEMO_PASSWORD, PBKDF2_ITERATIONS, SALT_BYTES, DERIVED_BITS, DEMO_USERS;
var init_seed_demo = __esm({
  "scripts/engine/seed-demo.mjs"() {
    "use strict";
    init_engine_paths();
    DEMO_PASSWORD = "1234";
    PBKDF2_ITERATIONS = 25e3;
    SALT_BYTES = 16;
    DERIVED_BITS = 256;
    DEMO_USERS = [
      { id: "30000000-0000-4000-8000-000000000301", email: "manager@demo.local", full_name: "مدیر مرکز نمونه", role: "manager", username: "manager" },
      { id: "30000000-0000-4000-8000-000000000302", email: "secretary@demo.local", full_name: "منشی مرکز نمونه", role: "secretary", username: "secretary" },
      { id: "30000000-0000-4000-8000-000000000303", email: "therapist@demo.local", full_name: "درمانگر مرکز نمونه", role: "therapist", username: "therapist" }
    ];
    if (import.meta.url === `file://${process.argv[1]}`) {
      const args = process.argv.slice(2);
      const i = args.indexOf("--data-dir");
      const dataDir = i >= 0 ? args[i + 1] : path5.join(REPO_ROOT2, "engine-data");
      const result = seedDemo(d1SqlitePath(dataDir));
      console.log(`[engine] seed نمایشی: ${result.usersCreated} کاربر ساخته شد (manager/secretary/therapist — رمز ۱۲۳۴) — ${d1SqlitePath(dataDir)}`);
    }
  }
});

// scripts/engine/engine.mjs
import { spawn } from "node:child_process";
import { randomBytes as randomBytes2 } from "node:crypto";
import { existsSync as existsSync5, mkdirSync as mkdirSync4, openSync as openSync2, promises as fsPromises, writeFileSync as writeFileSync2 } from "node:fs";
import { createServer as createServer2 } from "node:net";
import path6 from "node:path";
import { DatabaseSync as DatabaseSync5 } from "node:sqlite";

// scripts/engine/config.mjs
var import_mime = __toESM(require_mime(), 1);
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
var MINIFLARE_WORKERS = path.join(REPO_ROOT, "node_modules/miniflare/dist/src/workers");
var DO_COMPAT_DATE = "2023-07-24";
var D1_OBJECT_CLASS = "D1DatabaseObject";
var D1_UNIQUE_KEY = `miniflare-${D1_OBJECT_CLASS}`;
var HEADER_SIZE = 20;
var PATH_HASH_SIZE = 16;
var CONTENT_HASH_SIZE = 16;
var TAIL_SIZE = 8;
var CONTENT_HASH_OFFSET = PATH_HASH_SIZE;
var ENTRY_SIZE = PATH_HASH_SIZE + CONTENT_HASH_SIZE + TAIL_SIZE;
var IGNORED_ASSET_FILES = /* @__PURE__ */ new Set([".assetsignore", "_redirects", "_headers"]);
function capnpText(value) {
  let out = '"';
  for (const byte of Buffer.from(value, "utf8")) {
    if (byte === 34) out += '\\"';
    else if (byte === 92) out += "\\\\";
    else if (byte === 10) out += "\\n";
    else if (byte === 13) out += "\\r";
    else if (byte === 9) out += "\\t";
    else if (byte < 32 || byte === 127) out += `\\x${byte.toString(16).padStart(2, "0")}`;
    else out += String.fromCharCode(byte);
  }
  return `${out}"`;
}
function capnpData(bytes) {
  let out = '"';
  for (const byte of bytes) out += `\\x${byte.toString(16).padStart(2, "0")}`;
  return `${out}"`;
}
function jsonBinding(name, value) {
  return `(name = ${capnpText(name)}, json = ${capnpText(JSON.stringify(value))})`;
}
function textBinding(name, value) {
  return `(name = ${capnpText(name)}, text = ${capnpText(value)})`;
}
function serviceBinding(name, serviceName) {
  return `(name = ${capnpText(name)}, service = (name = ${capnpText(serviceName)}))`;
}
async function readWorkerFile(relativePath) {
  return fs.readFile(path.join(MINIFLARE_WORKERS, relativePath), "utf8");
}
async function buildAssetManifest(directory) {
  const files = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        files.push(path.relative(directory, path.join(dir, entry.name)));
      }
    }
  }
  await walk(directory);
  const manifest = [];
  const assetsReverseMap = {};
  for (const relativeFile of files) {
    const normalized = `/${relativeFile.split(path.sep).join("/")}`;
    if (IGNORED_ASSET_FILES.has(path.basename(normalized))) continue;
    const absPath = path.join(directory, relativeFile);
    const stat = await fs.stat(absPath);
    if (stat.isSymbolicLink() || stat.isDirectory()) continue;
    const pathHash = createHash("sha256").update(normalized).digest().subarray(0, PATH_HASH_SIZE);
    const contentHash = createHash("sha256").update(`${absPath}${stat.mtimeMs}`).digest().subarray(0, PATH_HASH_SIZE);
    manifest.push({ pathHash, contentHash });
    let contentType = import_mime.default.getType(absPath);
    if (contentType && contentType.startsWith("text/") && !contentType.includes("charset")) {
      contentType = `${contentType}; charset=utf-8`;
    }
    assetsReverseMap[contentHash.toString("hex")] = { filePath: relativeFile, contentType };
  }
  manifest.sort((a, b) => Buffer.compare(a.pathHash, b.pathHash));
  const encoded = Buffer.alloc(HEADER_SIZE + manifest.length * ENTRY_SIZE);
  manifest.forEach((entry, i) => {
    const offset = HEADER_SIZE + i * ENTRY_SIZE;
    entry.pathHash.copy(encoded, offset);
    entry.contentHash.copy(encoded, offset + CONTENT_HASH_OFFSET);
  });
  return { encodedAssetManifest: encoded, assetsReverseMap };
}
function d1Binding(bindingName, dbServiceName) {
  return `(name = ${capnpText(bindingName)}, wrapped = (moduleName = "cloudflare-internal:d1-api", innerBindings = [${serviceBinding("fetcher", dbServiceName)}]))`;
}
async function moduleEntry(name, contents) {
  return `(name = ${capnpText(name)}, esModule = ${capnpText(contents)})`;
}
async function buildEngineConfig(opts2) {
  const { port, gamesPort = 8788, dataDir, authSecret } = opts2;
  return buildCapnpConfig({
    port,
    gamesPort,
    dataDir,
    publicDir: path.join(REPO_ROOT, "public"),
    authSecret,
    env: "development"
  });
}
async function buildCapnpConfig(opts2) {
  const { port, gamesPort = 8788, dataDir, publicDir, manifestPublicDir = publicDir, authSecret, env } = opts2;
  const d1DiskPath2 = path.join(dataDir, "d1");
  const { encodedAssetManifest, assetsReverseMap } = await buildAssetManifest(manifestPublicDir);
  const [databaseWorker, objectEntryWorker, assetsKvWorker, assetWorker, routerWorker, sharedModule, zodModule] = await Promise.all([
    readWorkerFile("d1/database.worker.js"),
    readWorkerFile("shared/object-entry.worker.js"),
    readWorkerFile("assets/assets-kv.worker.js"),
    readWorkerFile("assets/assets.worker.js"),
    readWorkerFile("assets/router.worker.js"),
    readWorkerFile("shared/index.worker.js"),
    readWorkerFile("shared/zod.worker.js")
  ]);
  const [mainBundle, gamesBundle] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, "worker/bundle.js"), "utf8"),
    fs.readFile(path.join(REPO_ROOT, "worker/games-bundle.js"), "utf8")
  ]);
  const assetConfig = {
    account_id: "local",
    script_id: "main",
    html_handling: "auto-trailing-slash",
    not_found_handling: "none"
  };
  const routerConfig = { account_id: "local", script_id: "main", has_user_worker: true, invoke_user_worker_ahead_of_assets: false };
  const d1Service = "d1:db:main";
  const mainVars = [
    textBinding("ENV", env),
    textBinding("CF_ACCESS_TEAM_DOMAIN", ""),
    textBinding("CLINIC_NAME", "مرکز جامع"),
    textBinding("PUBLIC_BASE_URL", `http://127.0.0.1:${port}`),
    textBinding("AUTH_SECRET", authSecret),
    // rust-f9 — گیت زمان‌اجرای میز: مسیرهای /api/internal/sync/* فقط در موتور محلی زنده‌اند؛
    // در تولید وب این binding وجود ندارد → ۴۰۴ کم‌دست (باندل یکسان، رفتار تولید دست‌نخورده)
    textBinding("CENTER_DESKTOP_ENGINE", "1"),
    // ENG-4 (۱.۲۶.۴) — نشانی سلامت ورکر بازی‌ها برای ردیف تازهٔ پنل سلامت؛ فقط-افزودنی:
    // در تولید وب binding وجود ندارد → پنل سمت اپ games را «نامعلوم/خاموش» گزارش می‌کند
    textBinding("GAMES_HEALTH_URL", `http://127.0.0.1:${gamesPort}/health`)
  ];
  const gamesVars = [
    textBinding("ENV", env),
    textBinding("CF_ACCESS_TEAM_DOMAIN", ""),
    textBinding("PUBLIC_BASE_URL", `http://127.0.0.1:${port}`),
    textBinding("AUTH_SECRET", authSecret)
  ];
  const services = [
    // ورکر اصلی — باندل کامل اپ
    `(name = "main", worker = (compatibilityDate = "2025-01-01", compatibilityFlags = ["nodejs_compat"], bindings = [${d1Binding("DB", d1Service)}, ${serviceBinding("ASSETS", "assets:main")}, ${mainVars.join(", ")}], modules = [${await moduleEntry("bundle.js", mainBundle)}]))`,
    // ورکر بازی‌ها — بستهٔ مستقل ۱.۲۵.۷۵ با همان runtime-secret
    `(name = "games", worker = (compatibilityDate = "2025-01-01", compatibilityFlags = ["nodejs_compat"], bindings = [${d1Binding("DB", d1Service)}, ${gamesVars.join(", ")}], modules = [${await moduleEntry("games-bundle.js", gamesBundle)}]))`,
    // پشتهٔ D1 فایل‌محور — دیسک + DO + ورکر ورودی (چیدمان عین miniflare)
    `(name = "d1:storage", disk = (path = ${capnpText(d1DiskPath2)}, writable = true))`,
    `(name = "d1:db", worker = (compatibilityDate = ${capnpText(DO_COMPAT_DATE)}, compatibilityFlags = ["nodejs_compat", "experimental"], modules = [${await moduleEntry("database.worker.js", databaseWorker)}], durableObjectNamespaces = [(className = ${capnpText(D1_OBJECT_CLASS)}, uniqueKey = ${capnpText(D1_UNIQUE_KEY)})], durableObjectStorage = (localDisk = "d1:storage"), bindings = [${serviceBinding("MINIFLARE_BLOBS", "d1:storage")}]))`,
    `(name = ${capnpText(d1Service)}, worker = (compatibilityDate = ${capnpText(DO_COMPAT_DATE)}, bindings = [(name = "MINIFLARE_NAMESPACE", text = "main"), (name = "MINIFLARE_OBJECT", durableObjectNamespace = (className = ${capnpText(D1_OBJECT_CLASS)}, serviceName = "d1:db"))], modules = [${await moduleEntry("object-entry.worker.js", objectEntryWorker)}]))`,
    // پشتهٔ assets — کشیدن از دیسک public با مانیفست دودویی هم‌الگوریتم مینیفلر
    `(name = "assets:storage", disk = (path = ${capnpText(publicDir)}, writable = true))`,
    `(name = "assets-kv:main", worker = (compatibilityDate = ${capnpText(DO_COMPAT_DATE)}, compatibilityFlags = ["nodejs_compat"], bindings = [${serviceBinding("MINIFLARE_BLOBS", "assets:storage")}, ${jsonBinding("ASSETS_REVERSE_MAP", assetsReverseMap)}], modules = [${await moduleEntry("assets-kv-worker.mjs", assetsKvWorker)}]))`,
    `(name = "assets:main", worker = (compatibilityDate = "2024-07-31", compatibilityFlags = ["nodejs_compat"], bindings = [(name = "ASSETS_KV_NAMESPACE", kvNamespace = "assets-kv:main"), (name = "ASSETS_MANIFEST", data = ${capnpData(encodedAssetManifest)}), ${jsonBinding("CONFIG", assetConfig)}], modules = [${await moduleEntry("asset-worker.mjs", assetWorker)}]))`,
    `(name = "assets:router:main", worker = (compatibilityDate = "2024-07-31", compatibilityFlags = ["nodejs_compat", "no_nodejs_compat_v2"], bindings = [${serviceBinding("ASSET_WORKER", "assets:main")}, ${serviceBinding("USER_WORKER", "main")}, ${jsonBinding("CONFIG", routerConfig)}], modules = [${await moduleEntry("router-worker.mjs", routerWorker)}]))`
  ];
  const extensions = `(modules = [${await moduleEntry("miniflare:shared", sharedModule)}, ${await moduleEntry("miniflare:zod", zodModule)}])`;
  const sockets = [
    `(name = "main", address = "127.0.0.1:${port}", http = (), service = (name = "assets:router:main"))`,
    `(name = "games", address = "127.0.0.1:${gamesPort}", http = (), service = (name = "games"))`
  ];
  return `using W = import "/workerd/workerd.capnp";
const config :W.Config = (
  services = [
    ${services.join(",\n    ")}
  ],
  sockets = [
    ${sockets.join(",\n    ")}
  ],
  extensions = [${extensions}]
);
`;
}

// scripts/engine/adapter/server.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path2 from "node:path";
import { pathToFileURL } from "node:url";

// scripts/engine/adapter/d1.mjs
import { DatabaseSync } from "node:sqlite";
var PREP_CACHE_MAX = 400;
function makeD1(dbPath, { log } = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  try {
    db.exec("PRAGMA journal_mode = WAL;");
  } catch (e) {
    log?.(`تغییر journal_mode رد شد: ${e?.message ?? e}`);
  }
  const cache = /* @__PURE__ */ new Map();
  const prep = (sql) => {
    let st = cache.get(sql);
    if (!st) {
      if (cache.size >= PREP_CACHE_MAX) cache.clear();
      st = db.prepare(sql);
      cache.set(sql, st);
    }
    return st;
  };
  const conv = (v) => {
    if (v === void 0) return null;
    if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    if (v instanceof ArrayBuffer) return Buffer.from(v);
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  };
  class D1PreparedStatement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new D1PreparedStatement(this.sql, args.map(conv));
    }
    /** اجرای خام node:sqlite — برای run/batch */
    _raw() {
      return prep(this.sql).run(...this.args);
    }
    async all() {
      const stmt = prep(this.sql);
      const results = stmt.all(...this.args);
      return {
        results,
        success: true,
        meta: { duration: 0, rows_read: results.length, rows_written: 0, changes: 0, last_row_id: null }
      };
    }
    async first(col) {
      const row = prep(this.sql).get(...this.args);
      if (row === void 0 || row === null) return null;
      if (col === void 0) return row;
      return row[col] ?? null;
    }
    async run() {
      const t0 = Date.now();
      const r = this._raw();
      return {
        success: true,
        meta: { duration: Date.now() - t0, changes: Number(r.changes ?? 0), last_row_id: Number(r.lastInsertRowid ?? 0) }
      };
    }
  }
  const metaOf = (r, t0) => ({
    duration: Date.now() - t0,
    changes: Number(r.changes ?? 0),
    last_row_id: Number(r.lastInsertRowid ?? 0)
  });
  return {
    prepare: (sql) => new D1PreparedStatement(sql),
    /** batch در D1 اتمی است — روی تراکنش واقعی SQLite پیاده شد */
    async batch(statements) {
      const t0 = Date.now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const out = [];
        for (const s of statements) out.push({ success: true, meta: metaOf(prep(s.sql).run(...s.args), t0) });
        db.exec("COMMIT");
        return out;
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {
        }
        throw err;
      }
    },
    /** exec چند-دستوری (مسیر مایگریشن‌ها) — شکل D1: { count, duration } */
    async exec(sql) {
      const t0 = Date.now();
      db.exec(sql);
      const count = String(sql).split(";").filter((s) => s.trim().length > 0).length;
      return { count, duration: Date.now() - t0 };
    },
    /** خاموشی تمیز — engine.mjs هنگام چک‌پوینت/ری‌استارت صدا می‌زند */
    close() {
      try {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {
      }
      try {
        cache.clear();
        db.close();
      } catch (e) {
        log?.(`بستن DB رد شد: ${e?.message ?? e}`);
      }
    }
  };
}

// scripts/engine/adapter/server.mjs
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".csv": "text/csv; charset=utf-8",
  ".zip": "application/zip"
};
function serveStatic(publicDir, pathname, method) {
  let p = pathname;
  try {
    p = decodeURIComponent(p);
  } catch {
    return null;
  }
  if (p === "/" || p === "") p = "/index.html";
  const base = path2.normalize(publicDir + path2.sep);
  const abs = path2.normalize(path2.join(publicDir, p));
  if (abs !== path2.normalize(publicDir) && !abs.startsWith(base)) return null;
  let file = abs;
  try {
    if (statSync(file).isDirectory()) {
      const idx = path2.join(file, "index.html");
      if (!existsSync(idx)) return null;
      file = idx;
    }
  } catch {
    return null;
  }
  if (!existsSync(file)) return null;
  const ext = path2.extname(file).toLowerCase();
  const headers = {
    "content-type": MIME[ext] ?? "application/octet-stream",
    // دارایی هش‌دار مسیر /assets/ قابل کش دائمی؛ index.html همیشه تازه
    "cache-control": p.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"
  };
  const body = method === "HEAD" ? void 0 : readFileSync(file);
  return new Response(body, { status: 200, headers });
}
async function toWebRequest(req, url) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === "set-cookie") continue;
    headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  }
  const method = req.method.toUpperCase();
  let body;
  if (method !== "GET" && method !== "HEAD") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks);
    if (buf.length > 0) body = buf;
  }
  return new Request(url, { method, headers, body });
}
async function writeWebResponse(res, response) {
  const headers = { ...Object.fromEntries(response.headers) };
  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  res.writeHead(response.status, response.statusText || void 0, headers);
  for (const c of setCookies) res.appendHeader("set-cookie", c);
  if (reqHead(res.req?.method)) {
    res.end();
    return;
  }
  if (response.body) {
    try {
      for await (const chunk of response.body) res.write(chunk);
    } catch (e) {
      if (!res.writableEnded) try {
        res.end();
      } catch {
      }
      throw e;
    }
  }
  res.end();
}
var reqHead = (m) => String(m ?? "").toUpperCase() === "HEAD";
async function startAdapterEngine(opts2) {
  const { port, gamesPort, dbPath, mainBundle, gamesBundle, publicDir, log } = opts2;
  const bindings = opts2.bindings ?? {};
  const mainMod = await import(pathToFileURL(mainBundle).href);
  const gamesMod = await import(pathToFileURL(gamesBundle).href);
  if (typeof mainMod.default?.fetch !== "function" || typeof gamesMod.default?.fetch !== "function") {
    throw new Error("باندل ورکر شکل موردانتظار ({ fetch }) ندارد — بازسازی باندل‌ها لازم است");
  }
  const DB = makeD1(dbPath, { log });
  const mainEnv = {
    DB,
    ENV: "production",
    CF_ACCESS_TEAM_DOMAIN: bindings.cfAccessTeamDomain ?? "",
    CLINIC_NAME: bindings.clinicName ?? "مرکز جامع",
    PUBLIC_BASE_URL: bindings.publicBaseUrl ?? `http://127.0.0.1:${port}`,
    AUTH_SECRET: bindings.authSecret,
    CENTER_DESKTOP_ENGINE: "1",
    GAMES_HEALTH_URL: bindings.gamesHealthUrl ?? `http://127.0.0.1:${gamesPort}/health`
  };
  const gamesEnv = {
    DB,
    ENV: "production",
    CF_ACCESS_TEAM_DOMAIN: bindings.cfAccessTeamDomain ?? "",
    PUBLIC_BASE_URL: bindings.publicBaseUrl ?? `http://127.0.0.1:${port}`,
    AUTH_SECRET: bindings.authSecret
  };
  const makeCtx = () => {
    const pending = [];
    return {
      waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {
      })),
      passThroughOnException: () => {
      },
      abort: () => {
      },
      done: () => Promise.allSettled(pending)
    };
  };
  const mainServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    try {
      let response = null;
      if (req.method === "GET" || req.method === "HEAD") {
        response = serveStatic(publicDir, url.pathname, req.method);
      }
      if (!response) {
        const request = await toWebRequest(req, url);
        const ctx = makeCtx();
        response = await mainMod.default.fetch(request, mainEnv, ctx);
        await ctx.done();
      }
      if (!response) response = new Response(JSON.stringify({ ok: false, error: "no response from worker" }), { status: 500, headers: { "content-type": "application/json; charset=utf-8" } });
      await writeWebResponse(res, response);
    } catch (err) {
      log?.(`خطای پردازش درخواست ${req.method} ${url.pathname}: ${err?.stack ?? err}`);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "internal engine error" }));
      } else {
        try {
          res.end();
        } catch {
        }
      }
    }
  });
  const gamesServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${gamesPort}`);
    try {
      const request = await toWebRequest(req, url);
      const ctx = makeCtx();
      const response = await gamesMod.default.fetch(request, gamesEnv, ctx);
      await ctx.done();
      await writeWebResponse(res, response ?? new Response("no response from games worker", { status: 500 }));
    } catch (err) {
      log?.(`خطای پردازش بازی‌ها ${req.method} ${url.pathname}: ${err?.stack ?? err}`);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "internal games engine error" }));
      } else {
        try {
          res.end();
        } catch {
        }
      }
    }
  });
  const listen = (srv, p, name) => new Promise((resolve, reject) => {
    srv.once("error", reject);
    srv.listen(p, "127.0.0.1", () => {
      log?.(`سرویس ${name} روی پورت ${p} راه افتاد`);
      resolve();
    });
  });
  await listen(mainServer, port, "اصلی");
  try {
    await listen(gamesServer, gamesPort, "بازی‌ها");
  } catch (err) {
    try {
      mainServer.close();
      mainServer.closeAllConnections();
    } catch {
    }
    throw err;
  }
  return {
    close: async () => {
      await Promise.allSettled([
        new Promise((r) => {
          try {
            mainServer.closeAllConnections();
            mainServer.close(() => r());
          } catch {
            r();
          }
        }),
        new Promise((r) => {
          try {
            gamesServer.closeAllConnections();
            gamesServer.close(() => r());
          } catch {
            r();
          }
        })
      ]);
      DB.close();
    }
  };
}

// scripts/engine/engine.mjs
init_engine_paths();

// scripts/engine/apply-migrations.mjs
init_engine_paths();
import { existsSync as existsSync2, mkdirSync, readdirSync, readFileSync as readFileSync2 } from "node:fs";
import path4 from "node:path";
import { createRequire } from "node:module";
var { DatabaseSync: DatabaseSync2 } = createRequire(import.meta.url)("node:sqlite");
function applyMigrations(dbPath) {
  mkdirSync(path4.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync2(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const applied = new Set(db.prepare("SELECT version FROM _migrations").all().map((r) => r.version));
  const dir = path4.join(REPO_ROOT2, "migrations");
  const files = existsSync2(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    db.exec(readFileSync2(path4.join(dir, file), "utf8"));
    db.prepare("INSERT INTO _migrations (version) VALUES (?)").run(file);
    appliedCount++;
  }
  db.close();
  return { total: files.length, appliedCount };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--data-dir");
  const dataDir = i >= 0 ? args[i + 1] : path4.join(REPO_ROOT2, "engine-data");
  const result = applyMigrations(d1SqlitePath(dataDir));
  console.log(`[engine] مایگریشن‌ها: ${result.appliedCount} اعمال شد از ${result.total} (idempotent) — ${d1SqlitePath(dataDir)}`);
}

// scripts/engine/db-snapshot.mjs
import { copyFileSync, existsSync as existsSync3, mkdirSync as mkdirSync2, readdirSync as readdirSync2, rmSync, statSync as statSync2, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire as createRequire2 } from "node:module";
var { DatabaseSync: DatabaseSync3 } = createRequire2(import.meta.url)("node:sqlite");
var FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
var faNum = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
function utcStamp(d = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}
function backupsDirOf(dataDir) {
  return join(dataDir, "backups");
}
function verifyDbFile(dbPath) {
  let db = null;
  try {
    db = new DatabaseSync3(dbPath, { readOnly: true });
    const row = db.prepare("PRAGMA quick_check").get();
    const status = row ? String(Object.values(row)[0]) : "";
    return status === "ok";
  } catch {
    return false;
  } finally {
    try {
      db?.close();
    } catch {
    }
  }
}
function checkpointLiveWal(dbPath) {
  let db = null;
  try {
    db = new DatabaseSync3(dbPath);
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
  } finally {
    try {
      db?.close();
    } catch {
    }
  }
}
function rotateSnapshots(backupsDir, keep = 7) {
  let files = [];
  try {
    files = readdirSync2(backupsDir).filter((f) => /^backup-\d{8}-\d{6}(-\d+)?\.db$/.test(f)).map((f) => ({ f, m: statSync2(join(backupsDir, f)).mtimeMs })).sort((a, b) => b.m - a.m).map((x) => x.f);
  } catch {
    return [];
  }
  const removed = [];
  for (const f of files.slice(keep)) {
    try {
      unlinkSync(join(backupsDir, f));
      removed.push(f);
    } catch {
    }
  }
  return removed;
}
function takeSnapshot(dbPath, dataDir, opts2 = {}) {
  const log = opts2.log ?? ((msg) => console.log(`[engine] ${msg}`));
  const backupsDir = backupsDirOf(dataDir);
  const stamp = utcStamp();
  let name = `backup-${stamp}.db`;
  let outPath = join(backupsDir, name);
  let dup = 2;
  while (existsSync3(outPath)) {
    name = `backup-${stamp}-${dup}.db`;
    outPath = join(backupsDir, name);
    dup += 1;
  }
  try {
    mkdirSync2(backupsDir, { recursive: true });
    checkpointLiveWal(dbPath);
    copyFileSync(dbPath, outPath);
    const verified = verifyDbFile(outPath);
    if (!verified) {
      try {
        unlinkSync(outPath);
      } catch {
      }
      log(`پشتیبان فایل‌سطح تأیید نشد و کنار گذاشته شد (${name}) — پایگاه زنده دست‌نخورده ماند`);
      return { ok: false, path: null, bytes: 0, verified: false, name: null };
    }
    const removed = rotateSnapshots(backupsDir, opts2.keep ?? 7);
    const bytes = statSync2(outPath).size;
    log(`پشتیبان فایل‌سطح گرفته شد: ${name} (${Math.floor(bytes / 1024)} کیلوبایت)${removed.length ? ` — ${removed.length} پشتیبان قدیمی حذف شد` : ""}`);
    return { ok: true, path: outPath, bytes, verified: true, name };
  } catch (err) {
    log(`پشتیبان فایل‌سطح ناموفق بود — بی‌خطر رد شد: ${err?.message ?? err}`);
    return { ok: false, path: null, bytes: 0, verified: false, name: null };
  }
}
function newestVerifiedSnapshot(backupsDir) {
  let files = [];
  try {
    files = readdirSync2(backupsDir).filter((f) => /^backup-\d{8}-\d{6}(-\d+)?\.db$/.test(f)).map((f) => ({ f, m: statSync2(join(backupsDir, f)).mtimeMs })).sort((a, b) => b.m - a.m).map((x) => x.f);
  } catch {
    return null;
  }
  for (const f of files) {
    const p = join(backupsDir, f);
    if (verifyDbFile(p)) return { path: p, name: f };
  }
  return null;
}
function snapshotCorruptFile(dbPath) {
  const dir = join(dbPath, "..");
  const base = basename(dbPath);
  const stamp = utcStamp();
  const snap = (src, suffix) => {
    if (!existsSync3(src)) return null;
    let dest = join(dir, `${base}.corrupt-${stamp}${suffix}`);
    let n = 1;
    while (existsSync3(dest)) {
      dest = join(dir, `${base}.corrupt-${stamp}-${n}${suffix}`);
      n += 1;
    }
    try {
      copyFileSync(src, dest);
      return dest;
    } catch {
      return null;
    }
  };
  const main = snap(dbPath, ".bak");
  snap(`${dbPath}-wal`, "-wal.bak");
  snap(`${dbPath}-shm`, "-shm.bak");
  return main;
}
function restoreSnapshotOver(livePath, snapshotPath) {
  for (const side of [`${livePath}-wal`, `${livePath}-shm`]) {
    try {
      rmSync(side, { force: true });
    } catch {
    }
  }
  copyFileSync(snapshotPath, livePath);
}
function writeAuditRow(db, action, resourceType, resourceId, changes) {
  db.prepare(
    `INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, changes, created_at)
     VALUES (?, 'system', ?, ?, ?, ?, datetime('now'))`
  ).run(randomUUID(), action, resourceType, resourceId, JSON.stringify(changes ?? null));
}
function ensureDbIntegrityOrRestore(dbPath, dataDir, opts2 = {}) {
  const log = opts2.log ?? ((msg) => console.log(`[engine] ${msg}`));
  const fatal = opts2.fatal ?? ((msg) => {
    console.error(msg);
    process.exit(1);
  });
  if (!existsSync3(dbPath) || statSync2(dbPath).size === 0) {
    return { db: null, restored: null, fresh: true };
  }
  let db = null;
  let firstError = "";
  try {
    db = new DatabaseSync3(dbPath);
    const row = db.prepare("PRAGMA quick_check").get();
    const status = row ? String(Object.values(row)[0]) : "";
    if (status === "ok") return { db, restored: null };
    firstError = `quick_check: ${status || "بدون پاسخ"}`;
  } catch (err) {
    firstError = `باز کردن ممکن نشد: ${err?.message ?? err}`;
  }
  try {
    db?.close();
  } catch {
  }
  const corruptSnap = snapshotCorruptFile(dbPath);
  log(`پایگاه داده بررسی یکپارچگی را نگذراند (${firstError})`);
  log(corruptSnap ? `نسخهٔ آسیب‌دیده به «${basename(corruptSnap)}» کپی شد — هیچ داده‌ای حذف نشد` : "کپی نشانهٔ فایل آسیب‌دیده ممکن نشد");
  const snap = newestVerifiedSnapshot(backupsDirOf(dataDir));
  if (!snap) {
    fatal("[engine] هیچ پشتیبان تأییدشده‌ای موجود نیست — بوت متوقف شد؛ لطفاً با پشتیبانی تماس بگیرید");
    return null;
  }
  let restoredOk = false;
  try {
    restoreSnapshotOver(dbPath, snap.path);
    restoredOk = verifyDbFile(dbPath);
  } catch (err) {
    log(`بازسازی از پشتیبان ناموفق بود: ${err?.message ?? err}`);
  }
  if (!restoredOk) {
    fatal("[engine] بازسازی از پشتیبان هم بررسی یکپارچگی را نگذراند — بوت متوقف شد تا پایگاه خراب‌تر نشود؛ لطفاً با پشتیبانی تماس بگیرید");
    return null;
  }
  const m = snap.name.match(/^backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/);
  const when = m ? `${faNum(m[1])}/${faNum(m[2])}/${faNum(m[3])} ساعت ${faNum(m[4])}:${faNum(m[5])}:${faNum(m[6])} (UTC)` : faNum(snap.name);
  const message = `پایگاه داده آسیب دیده بود؛ از پشتیبان ${when} بازسازی شد`;
  log(message);
  try {
    const restored = new DatabaseSync3(dbPath);
    writeAuditRow(restored, "db.restore_from_backup", "database", snap.name, {
      corrupt_snapshot: corruptSnap ? basename(corruptSnap) : null,
      restored_from: snap.name,
      integrity_error: firstError
    });
    restored.close();
  } catch {
  }
  db = new DatabaseSync3(dbPath);
  return { db, restored: { message, from: snap.name, corrupt_snapshot: corruptSnap ? basename(corruptSnap) : null } };
}

// scripts/engine/human-log.mjs
import { existsSync as existsSync4, openSync, renameSync, statSync as statSync3, unlinkSync as unlinkSync2, appendFileSync, readFileSync as readFileSync3, writeFileSync } from "node:fs";
var LOG_ROTATE_BYTES = 5 * 1024 * 1024;
var LOG_KEEP_FILES = 7;
var HUMAN_EVENTS_QUEUE_KEY = "sys_human_events";
var HUMAN_EVENTS_MAX = 200;
function pushHumanEventDb(db, message, source = "engine") {
  if (!db) return;
  try {
    let list = [];
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(HUMAN_EVENTS_QUEUE_KEY);
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) list = parsed;
    }
    list.push({ ts: (/* @__PURE__ */ new Date()).toISOString(), source, msg: String(message) });
    while (list.length > HUMAN_EVENTS_MAX) list.shift();
    db.prepare(
      `INSERT INTO settings (key, value, updated_by) VALUES (?, ?, 'system')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = 'system', updated_at = datetime('now')`
    ).run(HUMAN_EVENTS_QUEUE_KEY, JSON.stringify(list));
  } catch {
  }
}
function readHumanEventsDb(db, limit = HUMAN_EVENTS_MAX) {
  if (!db) return [];
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(HUMAN_EVENTS_QUEUE_KEY);
    if (!row?.value) return [];
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.slice(-limit) : [];
  } catch {
    return [];
  }
}
function rotateFileIfNeeded(logPath, opts2 = {}) {
  const maxBytes = opts2.maxBytes ?? LOG_ROTATE_BYTES;
  const keep = opts2.keep ?? LOG_KEEP_FILES;
  let size = 0;
  try {
    size = statSync3(logPath).size;
  } catch {
    return false;
  }
  if (size < maxBytes) return false;
  try {
    const oldest = `${logPath}.${keep - 1}`;
    if (existsSync4(oldest)) unlinkSync2(oldest);
    for (let i = keep - 2; i >= 1; i -= 1) {
      const from = `${logPath}.${i}`;
      if (existsSync4(from)) renameSync(from, `${logPath}.${i + 1}`);
    }
    renameSync(logPath, `${logPath}.1`);
    return true;
  } catch {
    return false;
  }
}
function appendHumanEventLine(logPath, message, ts = (/* @__PURE__ */ new Date()).toISOString()) {
  try {
    rotateFileIfNeeded(logPath);
    appendFileSync(logPath, `[${ts}] ${String(message)}
`, "utf8");
  } catch {
  }
}
function posFileOf(logPath) {
  return `${logPath}.pos`;
}
function drainQueueToLog(db, logPath, opts2 = {}) {
  const events = readHumanEventsDb(db, HUMAN_EVENTS_MAX);
  if (events.length === 0) return null;
  let lastPos = null;
  try {
    lastPos = readFileSync3(posFileOf(logPath), "utf8").trim() || null;
  } catch {
    lastPos = null;
  }
  const pending = lastPos ? events.filter((e) => e?.ts > lastPos) : events;
  for (const e of pending) appendHumanEventLine(logPath, `${e.msg} [منبع: ${e.source}]`, e.ts);
  const lastTs = events[events.length - 1]?.ts ?? null;
  if (lastTs && pending.length > 0) {
    try {
      writeFileSync(posFileOf(logPath), lastTs, "utf8");
    } catch {
    }
  }
  return lastTs;
}

// scripts/engine/games-watchdog.mjs
var GAMES_WATCHDOG_POLICY = {
  backoffs_ms: [2e3, 5e3, 1e4],
  max_attempts: 3,
  window_ms: 10 * 6e4
};
var GAMES_FAIL_THRESHOLD = 2;
function nextAction(history, nowMs, failureAtMs) {
  const p = GAMES_WATCHDOG_POLICY;
  const first = history.length > 0 ? Math.min(...history.map((r) => r.at_ms)) : null;
  if (first === null) return { kind: "restart", delay_ms: p.backoffs_ms[0] };
  if (nowMs - first > p.window_ms || failureAtMs - first > p.window_ms) {
    return { kind: "reset_window" };
  }
  if (history.length >= p.max_attempts) return { kind: "give_up" };
  const idx = Math.min(history.length, p.backoffs_ms.length - 1);
  return { kind: "restart", delay_ms: p.backoffs_ms[idx] };
}
var FA_DIGITS2 = "۰۱۲۳۴۵۶۷۸۹";
var faNum2 = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS2[Number(d)]);
function restartMessage(attempt) {
  return `ورکر بازی‌ها ری‌استارت شد (تلاش ${faNum2(attempt)})`;
}

// scripts/engine/engine.mjs
function parseArgs(argv) {
  const out = { port: 8787, gamesPort: 8788, dataDir: path6.join(REPO_ROOT2, "engine-data"), seed: false, engine: "workerd" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--games-port") out.gamesPort = Number(argv[++i]);
    else if (a === "--data-dir") out.dataDir = path6.resolve(argv[++i]);
    else if (a === "--seed") out.seed = true;
    else if (a === "--engine") out.engine = argv[++i];
    else if (a === "--main-bundle") out.mainBundle = path6.resolve(argv[++i]);
    else if (a === "--games-bundle") out.gamesBundle = path6.resolve(argv[++i]);
    else if (a === "--public-dir") out.publicDir = path6.resolve(argv[++i]);
    else if (a === "--help") out.help = true;
  }
  return out;
}
var FA_DIGITS3 = "۰۱۲۳۴۵۶۷۸۹";
var faNum3 = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS3[Number(d)]);
var MIN_FREE_BYTES = 200 * 1024 * 1024;
var NIGHTLY_CHECKPOINT_MS = 24 * 60 * 60 * 1e3;
var RESTART_MARKER_KEY = "sys_restart_scheduled";
var GAMES_HEALTH_MIRROR_KEY = "sys_games_health";
var SYNC_MIRROR_KEY = "nodesync:status-mirror-v1";
var RUNTIME_POLL_MS = 5e3;
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer2();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer2();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}
async function resolvePort(requested, service = "") {
  if (await isPortFree(requested)) return requested;
  const alt = await freePort();
  const serviceName = service ? `سرویس ${service}` : "سرویس";
  console.log(`[engine] پورت ${faNum3(requested)} اشغال بود — ${serviceName} روی پورت ${faNum3(alt)} راه افتاد`);
  return alt;
}
async function assertDiskFree(dataDir) {
  if (typeof fsPromises.statfs !== "function") return;
  let stat;
  try {
    stat = await fsPromises.statfs(dataDir);
  } catch {
    return;
  }
  const freeBytes = Number(stat.bavail) * Number(stat.bsize);
  if (freeBytes >= MIN_FREE_BYTES) return;
  const freeMb = Math.floor(freeBytes / (1024 * 1024));
  console.error(`[engine] فضای دیسک کم است: فقط ${faNum3(freeMb)} مگابایت آزاد — دست‌کم ۲۰۰ مگابایت آزاد کنید`);
  console.error(`[engine] پوشهٔ داده: ${dataDir}`);
  process.exit(1);
}
function openDbAndAssertIntegrity(dbPath) {
  let db;
  try {
    db = new DatabaseSync5(dbPath);
  } catch {
    console.error("[engine] پایگاه داده اصلاً باز نشد — فایل آن‌قدر آسیب دیده که SQLite آن را نمی‌شناسد");
    console.error("[engine] برای ادامه، آخرین پشتیبان را بازگردانید و دوباره تلاش کنید");
    process.exit(1);
  }
  try {
    const row = db.prepare("PRAGMA quick_check").get();
    const status = row ? String(Object.values(row)[0]) : "";
    if (status !== "ok") {
      console.error(`[engine] پایگاه داده بررسی یکپارچگی را نگذراند (وضعیت: ${status || "بدون پاسخ"})`);
      console.error("[engine] فایل پایگاه داده سالم نیست — برای ادامه، آخرین پشتیبان را بازگردانید و دوباره تلاش کنید");
      db.close();
      process.exit(1);
    }
  } catch (err) {
    console.error(`[engine] بررسی یکپارچگی پایگاه داده ممکن نشد: ${err.message}`);
    db.close();
    process.exit(1);
  }
  return db;
}
function checkpointWal(db, reason) {
  if (!db) return;
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    console.log(`[engine] چک‌پوینت WAL انجام شد (${reason})`);
  } catch (err) {
    console.error(`[engine] چک‌پوینت WAL (${reason}) ناموفق بود — بی‌خطر و رد شد: ${err.message}`);
  }
}
function resolveAuthSecret(dbPath) {
  const db = new DatabaseSync5(dbPath);
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'sys_auth_secret' LIMIT 1`).get();
    if (row) {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === "string" && parsed) return parsed;
    }
    const secret = randomBytes2(32).toString("hex");
    db.prepare(`INSERT INTO settings (key, value) VALUES ('sys_auth_secret', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(secret));
    return secret;
  } finally {
    db.close();
  }
}
function findWorkerdBinary() {
  const candidates = [
    path6.join(REPO_ROOT2, "node_modules/workerd/bin/workerd"),
    path6.join(REPO_ROOT2, "node_modules/@cloudflare/workerd-linux-64/bin/workerd")
  ];
  for (const c of candidates) if (existsSync5(c)) return c;
  throw new Error("باینری workerd پیدا نشد — npm install را اجرا کنید");
}
async function waitHealth(url, child, timeoutMs = 3e4) {
  const started = Date.now();
  for (; ; ) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`workerd پیش از آماده شدن خارج شد (کد ${child.exitCode}) — لاگ: dataDir/workerd.log`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2e3) });
      if (res.ok) return;
    } catch {
    }
    if (Date.now() - started > timeoutMs) throw new Error(`/health بعد از ${timeoutMs}ms پاسخ نداد — لاگ: dataDir/workerd.log`);
    await new Promise((r) => setTimeout(r, 500));
  }
}
async function runEngine(opts2) {
  const dbPath = d1SqlitePath(opts2.dataDir);
  mkdirSync4(opts2.dataDir, { recursive: true });
  const workerdLogPath = path6.join(opts2.dataDir, "workerd.log");
  const eventsLogPath = path6.join(opts2.dataDir, "events-fa.log");
  await assertDiskFree(opts2.dataDir);
  const pre = ensureDbIntegrityOrRestore(dbPath, opts2.dataDir);
  if (pre.restored) {
    pushHumanEventDb(pre.db, pre.restored.message, "engine");
    console.log(`[engine] ${pre.restored.message}`);
    pre.db.close();
  }
  let mig;
  try {
    mig = applyMigrations(dbPath);
  } catch {
    console.error("[engine] پایگاه داده برای مایگریشن باز نشد — فایل داده سالم نیست");
    console.error("[engine] برای ادامه، آخرین پشتیبان را بازگردانید و دوباره تلاش کنید");
    process.exit(1);
  }
  console.log(`[engine] مایگریشن‌ها: ${mig.appliedCount} اعمال شد (از ${mig.total})`);
  const walDb = openDbAndAssertIntegrity(dbPath);
  if (opts2.seed || !existsSync5(dbPath)) {
    const { seedDemo: seedDemo2 } = await Promise.resolve().then(() => (init_seed_demo(), seed_demo_exports));
    const s = seedDemo2(dbPath);
    console.log(`[engine] seed نمایشی: ${s.usersCreated} کاربر (manager/secretary/therapist — رمز ۱۲۳۴)`);
  }
  rotateFileIfNeeded(workerdLogPath);
  const bootSnap = takeSnapshot(dbPath, opts2.dataDir);
  if (bootSnap.ok) {
    pushHumanEventDb(walDb, "پشتیبان فایل‌سطح پایگاه گرفته شد", "engine");
    try {
      writeAuditRow(walDb, "db.backup_file", "database", bootSnap.name, { bytes: bootSnap.bytes, phase: "boot" });
    } catch {
    }
  }
  drainQueueToLog(walDb, eventsLogPath);
  const port = await resolvePort(opts2.port);
  const gamesPort = await resolvePort(opts2.gamesPort, "بازی‌ها");
  const authSecret = resolveAuthSecret(dbPath);
  const isAdapter = opts2.engine === "adapter";
  if (isAdapter) {
    const configOut = path6.join(opts2.dataDir, "engine-config.json");
    writeFileSync2(configOut, JSON.stringify({
      engine: "adapter",
      port,
      gamesPort,
      dbPath,
      mainBundle: opts2.mainBundle ?? path6.join(REPO_ROOT2, "worker/bundle.js"),
      gamesBundle: opts2.gamesBundle ?? path6.join(REPO_ROOT2, "worker/games-bundle.js"),
      publicDir: opts2.publicDir ?? path6.join(REPO_ROOT2, "public"),
      authSecret,
      pid: process.pid,
      written_at: (/* @__PURE__ */ new Date()).toISOString()
    }, null, 2) + "\n");
  } else {
    const configText = await buildEngineConfig({ port, gamesPort, dataDir: opts2.dataDir, authSecret });
    writeFileSync2(path6.join(opts2.dataDir, "workerd.capnp"), configText);
  }
  const base = `http://127.0.0.1:${port}`;
  const gamesBase = `http://127.0.0.1:${gamesPort}`;
  let child = null;
  let handle = null;
  let shuttingDown = false;
  let restartingNow = false;
  let bin = null;
  let logFd = null;
  const spawnChild = () => spawn(bin, ["serve", "--experimental", `--import-path=${path6.join(REPO_ROOT2, "node_modules/workerd")}`, path6.join(opts2.dataDir, "workerd.capnp")], { stdio: ["ignore", logFd, logFd] });
  const attachChildHandlers = () => {
    child.once("exit", (code, signal) => {
      if (shuttingDown || restartingNow) return;
      console.error(`[engine] workerd ناگهان خارج شد (کد ${code} سیگنال ${signal})`);
      process.exit(1);
    });
  };
  const startAdapter = async () => {
    handle = await startAdapterEngine({
      port,
      gamesPort,
      dbPath,
      mainBundle: opts2.mainBundle ?? path6.join(REPO_ROOT2, "worker/bundle.js"),
      gamesBundle: opts2.gamesBundle ?? path6.join(REPO_ROOT2, "worker/games-bundle.js"),
      publicDir: opts2.publicDir ?? path6.join(REPO_ROOT2, "public"),
      bindings: { authSecret, publicBaseUrl: base, gamesHealthUrl: `${gamesBase}/health` },
      log: (m) => console.log(`[engine] ${m}`)
    });
  };
  const stopAdapter = async () => {
    if (!handle) return;
    const h = handle;
    handle = null;
    await h.close();
  };
  if (isAdapter) {
    await startAdapter();
    console.log(`[engine] موتور درون‌پروسه‌ای بالا آمد — اپ: ${base} | بازی‌ها: ${gamesBase} | داده: ${opts2.dataDir}`);
  } else {
    bin = findWorkerdBinary();
    logFd = openSync2(workerdLogPath, "a");
    child = spawnChild();
    attachChildHandlers();
    console.log(`[engine] workerd بالا آمد — اپ: ${base} | بازی‌ها: ${gamesBase} | داده: ${opts2.dataDir}`);
  }
  let nightlyCheckpoint = null;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[engine] خاموشی تمیز (${signal})...`);
    if (nightlyCheckpoint) clearInterval(nightlyCheckpoint);
    if (isAdapter) {
      void (async () => {
        await stopAdapter();
        checkpointWal(walDb, "خاموشی تمیز");
        process.exit(0);
      })();
      return;
    }
    child.kill("SIGTERM");
    const forceTimer = setTimeout(() => child.kill("SIGKILL"), 5e3);
    child.once("exit", () => {
      clearTimeout(forceTimer);
      console.log("[engine] workerd خاموش شد");
      checkpointWal(walDb, "خاموشی تمیز");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  try {
    if (isAdapter) await waitHealth(`${base}/health`, null);
    else await waitHealth(`${base}/health`, child);
  } catch (err) {
    checkpointWal(walDb, "پس از شکست بوت");
    throw err;
  }
  console.log("[engine] /health سبز است");
  try {
    walDb.prepare("DELETE FROM settings WHERE key = ?").run(RESTART_MARKER_KEY);
  } catch {
  }
  const respawnWorkerd = async (reason) => {
    if (restartingNow || shuttingDown) return;
    restartingNow = true;
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          console.log(`[engine] ری‌استارت تمیز workerd (${reason}) — تلاش ${attempt}/3...`);
          const old = child;
          await new Promise((resolve) => {
            if (old.exitCode !== null || old.signalCode !== null) return resolve();
            const forceTimer = setTimeout(() => {
              try {
                old.kill("SIGKILL");
              } catch {
              }
            }, 5e3);
            old.once("exit", () => {
              clearTimeout(forceTimer);
              resolve();
            });
          });
          checkpointWal(walDb, `پیش از ری‌استارت (${reason})`);
          child = spawnChild();
          attachChildHandlers();
          await waitHealth(`${base}/health`, child);
          try {
            walDb.prepare("DELETE FROM settings WHERE key = ?").run(RESTART_MARKER_KEY);
          } catch {
          }
          pushHumanEventDb(walDb, "راه‌اندازی دوبارهٔ سامانه از پنل", "engine");
          drainQueueToLog(walDb, eventsLogPath);
          console.log("[engine] ری‌استارت کامل شد — /health سبز است");
          return;
        } catch (err) {
          console.error(`[engine] تلاش ${attempt}/3 ری‌استارت ناکام ماند: ${err?.message ?? err}`);
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
        }
      }
      console.error("[engine] هر ۳ تلاش ری‌استارت ناکام بود — برای مداخلهٔ نگهبان بیرونی (Rust) خارج می‌شود");
      try {
        writeAuditRow(walDb, "system.respawn_failed", "system", "engine", { reason });
      } catch {
      }
      process.exit(1);
    } finally {
      restartingNow = false;
    }
  };
  let gamesHistory = [];
  let gamesFails = 0;
  let gamesGiveUp = false;
  let lastSyncKey = null;
  const respawnAdapter = async (reason) => {
    if (restartingNow || shuttingDown) return;
    restartingNow = true;
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          console.log(`[engine] ری‌استارت تمیز موتور درون‌پروسه‌ای (${reason}) — تلاش ${attempt}/3...`);
          await stopAdapter();
          checkpointWal(walDb, `پیش از ری‌استارت (${reason})`);
          await startAdapter();
          await waitHealth(`${base}/health`, null);
          try {
            walDb.prepare("DELETE FROM settings WHERE key = ?").run(RESTART_MARKER_KEY);
          } catch {
          }
          pushHumanEventDb(walDb, "راه‌اندازی دوبارهٔ سامانه از پنل", "engine");
          drainQueueToLog(walDb, eventsLogPath);
          console.log("[engine] ری‌استارت کامل شد — /health سبز است");
          return;
        } catch (err) {
          console.error(`[engine] تلاش ${attempt}/3 ری‌استارت ناکام ماند: ${err?.message ?? err}`);
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
        }
      }
      console.error("[engine] هر ۳ تلاش ری‌استارت ناکام بود — برای مداخلهٔ نگهبان بیرونی (Rust) خارج می‌شود");
      try {
        writeAuditRow(walDb, "system.respawn_failed", "system", "engine", { reason });
      } catch {
      }
      process.exit(1);
    } finally {
      restartingNow = false;
    }
  };
  const respawnEngine = isAdapter ? respawnAdapter : respawnWorkerd;
  const syncEventMaybe = () => {
    try {
      const row = walDb.prepare("SELECT value FROM settings WHERE key = ?").get(SYNC_MIRROR_KEY);
      if (!row?.value) return;
      const mirror = JSON.parse(row.value);
      const key = `${mirror.state ?? ""}|${mirror.last_error_kind ?? ""}`;
      if (key === lastSyncKey) return;
      const first = lastSyncKey === null;
      lastSyncKey = key;
      if (first) return;
      if (mirror.state === "synced") pushHumanEventDb(walDb, "هم‌گام‌سازی با مرکز موفق بود", "sync");
      else if (mirror.state === "error" || mirror.state === "offline") {
        pushHumanEventDb(walDb, "هم‌گام‌سازی با مرکز قطع شد — ثبت‌ها همین‌جا محفوظ است", "sync");
      } else if (mirror.state === "paused_version") {
        pushHumanEventDb(walDb, "هم‌گام‌سازی متوقف شد — اول مرکز را به‌روزرسانی کنید", "sync");
      }
    } catch {
    }
  };
  const runtimePoll = async () => {
    if (shuttingDown || restartingNow) return;
    try {
      const row = walDb.prepare("SELECT value FROM settings WHERE key = ?").get(RESTART_MARKER_KEY);
      if (row) {
        pushHumanEventDb(walDb, "راه‌اندازی دوبارهٔ سامانه از پنل", "engine");
        try {
          writeAuditRow(walDb, "system.restart", "system", "engine", { via: "panel" });
        } catch {
        }
        await respawnEngine("درخواست پنل");
        return;
      }
    } catch {
    }
    let mainOk = false;
    let gamesOk = false;
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2500) });
      const j = await r.json().catch(() => null);
      mainOk = r.ok && j?.ok === true;
    } catch {
      mainOk = false;
    }
    let gamesBootTs = null;
    try {
      const r = await fetch(`${gamesBase}/health`, { signal: AbortSignal.timeout(2500) });
      const j = await r.json().catch(() => null);
      gamesOk = r.ok && j?.ok === true;
      gamesBootTs = typeof j?.boot_ts === "string" ? j.boot_ts : null;
    } catch {
      gamesOk = false;
    }
    try {
      const snap = JSON.stringify({ ok: gamesOk, boot_ts: gamesBootTs, checked_at: (/* @__PURE__ */ new Date()).toISOString(), port: gamesPort });
      walDb.prepare(`INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`).run(GAMES_HEALTH_MIRROR_KEY, snap);
    } catch {
    }
    if (gamesOk) {
      if (gamesFails > 0 || gamesHistory.length > 0 || gamesGiveUp) {
        console.log("[engine] ورکر بازی‌ها دوباره سالم است — شمارش نگهبان از صفر");
      }
      gamesFails = 0;
      gamesHistory = [];
      gamesGiveUp = false;
    } else if (mainOk) {
      gamesFails += 1;
      if (gamesFails >= GAMES_FAIL_THRESHOLD && !gamesGiveUp) {
        gamesFails = 0;
        const now = Date.now();
        let decision = nextAction(gamesHistory, now, now);
        if (decision.kind === "reset_window") {
          gamesHistory = [];
          console.log("[engine] پنجرهٔ ۱۰ دقیقه‌ای نگهبان بازی‌ها گذشت — شمارش تلاش‌ها از صفر");
          decision = nextAction(gamesHistory, now, now);
        }
        if (decision.kind === "give_up") {
          gamesGiveUp = true;
          console.error("[engine] نگهبان بازی‌ها تسلیم شد — ۳ تلاش در پنجرهٔ ۱۰ دقیقه بی‌نتیجه بود؛ بخش اداری سالم مانده و بازی‌ها تا تلاش دوباره از پنل در دسترس نیست");
          pushHumanEventDb(walDb, "ورکر بازی‌ها پس از ۳ تلاش بالا نیامد — بقیهٔ سامانه سالم است؛ با پشتیبانی تماس بگیرید", "engine");
          try {
            writeAuditRow(walDb, "system.games_worker_down", "system", "games", { attempts: gamesHistory.length });
          } catch {
          }
        } else if (decision.kind === "restart") {
          const attempt = gamesHistory.length + 1;
          console.log(`[engine] ورکر بازی‌ها ناسالم است — ری‌استارت تا ${decision.delay_ms / 1e3} ثانیه دیگر (تلاش ${attempt})`);
          gamesHistory.push({ at_ms: now, delay_ms: decision.delay_ms });
          pushHumanEventDb(walDb, restartMessage(attempt), "engine");
          try {
            writeAuditRow(walDb, "system.games_worker_restart", "system", "games", { attempt, delay_ms: decision.delay_ms });
          } catch {
          }
          await new Promise((r) => setTimeout(r, decision.delay_ms));
          if (shuttingDown || restartingNow) return;
          await respawnEngine(`نگهبان بازی‌ها — تلاش ${attempt}`);
          return;
        }
      }
    }
    drainQueueToLog(walDb, eventsLogPath);
    syncEventMaybe();
  };
  const safeRuntimePoll = () => runtimePoll().catch((err) => console.error(`[engine] خطای گذرای پایش نادیده گرفته شد: ${err?.message ?? err}`));
  const runtimePoller = setInterval(safeRuntimePoll, RUNTIME_POLL_MS);
  void safeRuntimePoll();
  runtimePoller.unref();
  nightlyCheckpoint = setInterval(() => {
    checkpointWal(walDb, "شبانه");
    const snap = takeSnapshot(dbPath, opts2.dataDir);
    if (snap.ok) pushHumanEventDb(walDb, "پشتیبان شبانهٔ پایگاه گرفته شد", "engine");
    rotateFileIfNeeded(workerdLogPath);
    drainQueueToLog(walDb, eventsLogPath);
  }, NIGHTLY_CHECKPOINT_MS);
  nightlyCheckpoint.unref();
  return isAdapter ? { close: stopAdapter } : child;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const opts2 = parseArgs(process.argv.slice(2));
  if (opts2.help) {
    console.log("استفاده: node scripts/engine/engine.mjs --port 8787 --data-dir <مسیر> [--games-port 8788] [--seed]");
  } else {
    await runEngine(opts2);
  }
}

// scripts/engine/engine-server-entry.mjs
var opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log("استفاده: node engine-server.js --engine adapter --data-dir <مسیر> [--port 8787] [--games-port 8788] --main-bundle <bundle.js> --games-bundle <games.js> --public-dir <public>");
  console.log("موتور دسکتاپ مرکز جامع — v1.27.۰۳ (adapter درون‌پروسه‌ای، بدون workerd)");
} else {
  await runEngine(opts);
}
