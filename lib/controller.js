var isRegExp = require('util').isRegExp;
var join = require('path').join;
var express = require('express');
var _ = require('underscore');
var methods = require('methods');

var Controller = module.exports = function Controller(options) {
  if (!(this instanceof Controller)) {
    return new Controller(options);
  }

  var self = this;

  this.options      = {},
  this.routes       = [],
  this.actions      = {},
  this.middlewares  = [],
  this.chainCache   = {},
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
      return this.app.handle.bind(this.app);
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

  this._controllerInit = function controllerInit(req, res, next) {
    var route = _.find(self.routes, function(route) {
      return route.method === req.route.method
          && route.path === req.route.path;
    });
    if (route) req.action = route.action;

    var scope = ['all'];
    if (req.action) {
      scope = scope.concat(self.actions[req.action].groups);
      scope.push(req.action);
    }

     var inScope = function(group) { return ~scope.indexOf(group); };
    var key = scope.join(',');
    if (!self.chainCache[key]) {
      self.chainCache[key] = _.chain(self.middlewares)
        .filter(function(mw) { return mw.scope.some(inScope) })
        .sortBy(function(mw) { return scope.indexOf(_.find(mw.scope, inScope))})
        .value();

      req.route.callbacks = _.reject(req.route.callbacks, function(mw) {
        return !!mw.scope;
      });

      var chain = self.chainCache[key];
      req.route.callbacks.splice.apply(req.route.callbacks, 
        [1, 0].concat(chain));
    }

    next();
  };

  this._middlewarePop = function controllerMiddlewarePop(req, res, next) {
    console.log(req._mwchain)
    if (!req._mwchain || !req._mwchain.length) return next();
    else req._mwchain.pop()(req, res, next);
  }
}

Controller.prototype.middleware = function middleware() {
  var args = _.flatten([].slice.call(arguments), true), 
      scope = [], fns = [], self = this;
  while (args.length) {
    var arg = args.shift();
    (typeof arg === 'function' ? fns : scope).push(arg);
  }
  if (!scope.length) scope.push('all');
  var isAll = !!~scope.indexOf('all');

  fns.forEach(function(fn) {
    Object.defineProperty(fn, 'scope', {value: scope});
    self.middlewares.push(fn);
  });

  // Purge any related caches.
  Object.keys(this.chainCache).forEach(function(chain) {
    var groups = chain.split(',');
    if (!!groups.some(function(group) { return ~scope.indexOf(group) })) {
      delete self.chainCache[chain];
    }
  })
}

Controller.prototype.createRoute = function route(method, path, action) {
  method = method.toLowerCase();
  path = join(this.options.prefix, path);
  var self = this;
  this.routes.push({ method: method, path: path, action: action });
  this.app[method](path, this._controllerInit, function(req, res, next) {
    if (!self.actions[action]) {
      next(new Error('Unhandled action - ' + method + ' ' + action));
    } else {
      self.actions[action].handler.call(self, req, res, next);
    }
  });
}

Controller.prototype.define = function define(name, groups, handler) {
  if (typeof groups === 'function') handler = groups, groups = [];
  this.actions[name] = { groups: groups, handler: handler };
}

methods.forEach(function(method) {
  Controller.prototype[method] = function() {
    return this.define.apply(this, [method].concat([].slice.call(arguments)));
  };
});

Controller.prototype.direct = (function() {
  var anonCount = 0;
  var anonId = function() { return 'anonymous-' + ++anonCount; }
  return function direct(method, path /* [mw/g], fn */) {
    var args = [].slice.call(arguments),
        groups = [], item, id = anonId();
    args.shift(); args.shift();
    var handler = args.pop();
    while (args.length) {
      item = args.shift();
      if (typeof item === 'string') {
        groups.push(item);
      } else {
        var anonGroup = anonId();
        groups.push(anonGroup);
        this.middleware(anonGroup, item);
      }
    }
    this.define(id, groups, handler);
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