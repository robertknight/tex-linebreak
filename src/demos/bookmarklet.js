javascript:(function() {
/* 1. Save the contents of this file as the URL of a new bookmark in your
      browser.
   2. Visit a website and activate the bookmark. */
var libScript = document.createElement('script');
libScript.src = 'https://unpkg.com/tex-linebreak';
document.body.appendChild(libScript);

var dictScript = document.createElement('script');
dictScript.src = 'https://unpkg.com/tex-linebreak/dist/hyphens_en-us.js';
document.body.appendChild(dictScript);

var libLoaded = new Promise(resolve => libScript.onload=resolve);
var dictLoaded = new Promise(resolve => dictScript.onload=resolve);

Promise.all([libLoaded, dictLoaded]).then(() => {
  var lib = window.texLineBreak_lib;
  var h = lib.createHyphenator(window['texLineBreak_hyphens_en-us']);
  var paras = [...document.querySelectorAll('p')];
  lib.justifyContent(paras, h);
}).catch(err => console.error(err));
})()
