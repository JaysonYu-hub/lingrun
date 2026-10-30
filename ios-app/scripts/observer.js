// Executes before page requests. Only records the two sports query paths.
// Tokens are hashed for namespace matching; raw values are never sent to a message handler.
function sportsURL(value) {
  try {
    var url = new URL(value, location.href);
    return url.origin === location.origin && !url.username && !url.password &&
      /\/mobile\/extExercise\/(findExeRule|findExtExercise)\/?$/.test(url.pathname) ? url.href : null;
  } catch (_) { return null; }
}
function observe(url, token) {
  var target = sportsURL(url);
  if (!target) return;
  var requests = window.__exerciseObservedRequests || (window.__exerciseObservedRequests = []);
  if (requests.indexOf(target) < 0) requests.push(target);
  if (requests.length > 32) requests.shift();
  if (typeof token === 'string' && token) {
    var auth = window.__exerciseObservedAuth || (window.__exerciseObservedAuth = []);
    auth.push({url: target, digest: core.sha1(token), at: Date.now()});
    if (auth.length > 32) auth.shift();
  }
}
var open = XMLHttpRequest.prototype.open, set = XMLHttpRequest.prototype.setRequestHeader,
    send = XMLHttpRequest.prototype.send;
var metadata = new WeakMap();
XMLHttpRequest.prototype.open = function(method, url) {
  metadata.set(this, {url: String(url), token: null});
  return open.apply(this, arguments);
};
XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  var item = metadata.get(this);
  if (item && String(name).toLowerCase() === 'authorization') item.token = String(value);
  return set.apply(this, arguments);
};
XMLHttpRequest.prototype.send = function() {
  var item = metadata.get(this);
  if (item) { observe(item.url, item.token); metadata.delete(this); }
  return send.apply(this, arguments);
};
if (typeof window.fetch === 'function') {
  var originalFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      var url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      var headers = new Headers(init && init.headers || input && input.headers || {});
      observe(url, headers.get('Authorization'));
    } catch (_) {}
    return originalFetch.apply(this, arguments);
  };
}
