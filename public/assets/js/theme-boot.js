(function () {
  try {
    var saved = localStorage.getItem('cs.theme');
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = saved || sys;
  } catch (e) { /* noop */ }
})();
