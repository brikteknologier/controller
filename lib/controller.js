var isRegExp = require('util').isRegExp;
var join = require('path').join;
var express = require('express');

var Controller = module.exports = function Controller(options) {
  if (!(this instanceof Controller)) {
    return new Controller(options);
  }

  var self = this;

  this.options      = {},
  this.routes       = {},
  this.actions      = {},
  this.middlewares  = {},
  this.app          = express();

  // `this.options.prefix` -> `this.app.route`
  Object.defineProperty(this.options, 'prefix', {
    enumerable: true, configurable: true, 
    get: function() { return self.app.route; },
    set: function(val) { self.app.route = val; }
  });
  this.options.prefix = options && options.prefix || this.app.route;

  // Make controller look like a server
  Object.defineProperty(this, 'handle', {
    get: function() {
      return this.app.handle;
    }
  });

  // Make sure Connect doesn't try to eat our route 
  Object.defineProperty(this, 'route', {
    enumerable: true, configurable: true, 
    get: function() { return this.createRoute; },
    set: function(route) {
      if (route != '/') {
        this.options.prefix = join(route, this.options.prefix);
      }
    }
  });
}

Controller.prototype.middleware = function middleware(scope, fn) {
  if (scope == null) scope = 'all';
  else if (typeof scope === 'function') fn = scope, scope = 'all';
  if (fn != null) this.middleware(scope).push(fn);
  return this.middlewares[scope] || (this.middlewares[scope] = []); 
}

Controller.prototype.createRoute = function route(method, path, action) {
  this.routes[action] = { method: method.toLowerCase(), path: path };
}

Controller.prototype.define = function define(name, groups, handler) {
  if (typeof groups === 'function') handler = groups, groups = [];
  this.actions[name] = { groups: groups, handler: handler };
}

Controller.prototype.direct = (function() {
  var anonCount = 0;
  var anonId = function() { return 'anonymous-' + ++anonCount; }
  return function direct(method, path /* [mw/g], fn */) {
    var args = [].slice.call(arguments),
        groups = [], mw = [], item, id = anonId();
    args.shift(), args.shift();
    var handler = args.pop();
    while (args.length > 0) 
      (typeof (item = args.shift()) === 'string' ? groups : mw).push(item);
    this.define(id, groups, handler);
    while (mw.length > 0) this.middleware(id).push(mw.pop())
    this.route(method, path, id);
  }
})()

Controller.prototype.attach = function attach(app) {
  var self = this;
  Object.keys(this.routes).forEach(function(actionName) {
    var middleware = [].concat(self.middleware()),
        action = self.actions[actionName],
        route = self.routes[actionName];
    action.groups.concat([actionName]).forEach(function(group) {
      middleware.push.apply(middleware, self.middleware(group));
    });
    var path = route.path;
    if (!isRegExp(path) && self.options.prefix) {
      path = join(self.options.prefix, path);
    }
    var routeArgs = [path, action.handler];
    if (middleware.length) routeArgs.splice(1, 0, middleware);
    app[route.method].apply(app, routeArgs);
  });
}