var isRegExp = require('util').isRegExp;
var join = require('path').join;
var express = require('express');
var _ = require('underscore');
var methods = require('methods');

var Controller = module.exports = function Controller() {
  if (!(this instanceof Controller)) {
    return new Controller();
  }

  var self = this;

  this.routes       = [],
  this.actions      = {},
  this.middlewares  = [],
  this.chainCache   = {},
  this.app          = express();

  // Make controller look like a server
  Object.defineProperty(this, 'handle', {
    get: function() {
      return this.app.handle.bind(this.app);
    }
  });

  // Make sure Connect doesn't try to eat our route 
  Object.defineProperty(this, 'route', {
    enumerable: true, configurable: true, 
    writable: false, value: this.createRoute
  });

  this._controllerInit = function controllerInit(req, res, next) {
    var route = _.find(self.routes, function(route) {
      return route.method === req.route.method
          && route.path === req.route.path
          && route.self === self;
    });
    if (route) {
      req.action = route.action;
      req._action = self.actions[req.action];
    }

    var scope = ['all'];
    if (req._action) {
      scope = scope.concat(req._action.groups);
      scope.push(req.action);
    }

    var key = req.route.path + '-' + scope.join(',');
    if (!self.chainCache[key]) {
      self.chainCache[key] = collectMiddlewares.call(self, scope);
      req.route.callbacks = _.reject(req.route.callbacks, function(mw) {
        return !!mw.scope && mw.self == self;
      });

      var chain = self.chainCache[key];
      req.route.callbacks.splice.apply(req.route.callbacks, 
        [1, 0].concat(chain));
    }

    next();
  };
}

function collectMiddlewares(scope) {
  var inScope = function(group) { return ~scope.indexOf(group); };
  return _.sortBy(
    _collectMiddlewares.call(this, scope),
    function(mw) { return scope.indexOf(_.find(mw.scope, inScope)) }
  );
}

function _collectMiddlewares(scope, base) {
  if (!base) base = [];
  if (this.parent instanceof Controller)
    base = _collectMiddlewares.call(this.parent, scope, base);

  var inScope = function(group) { return ~scope.indexOf(group); };
  return base.concat(
    _.chain(this.middlewares)
      .filter(function(mw) { return mw.scope.some(inScope) })
      .value()
  );
}

Controller.prototype.addSubController = function(route, controller) {
  if (typeof route != 'string') {
    controller = route;
    route = '/';
  }

  if (controller instanceof Controller) controller.parent = this;
  this.app.use(route, controller);
};

Controller.prototype.middleware = Controller.prototype.use = 
function middleware(route, controller) {
  // just assume we're mounting a subcontroller/app to start with...
  if (typeof route != 'string' && route.handle) {
    controller = route;
    route = '/';
  }
  
  if (controller && controller.handle) 
    return this.addSubController(route, controller);
 
  // oh, not a controller/app? ok, proceed as normal...
  var args = _.flatten([].slice.call(arguments), true), 
      scope = [], fns = [], self = this;

  while (args.length) {
    var arg = args.shift();
    (typeof arg === 'function' ? fns : scope).push(arg);
  }

  if (!scope.length) scope.push('all');
  var isAll = !!~scope.indexOf('all');

  fns.forEach(function(fn) {
    fn.scope = scope;
    fn.self = self;
    self.middlewares.push(fn);
  });

  // Purge any related caches.
  Object.keys(this.chainCache).forEach(function(chain) {
    var groups = chain.split(',');
    if (!!groups.some(function(group) { return ~scope.indexOf(group) })) {
      delete self.chainCache[chain];
    }
  });

  return this;
}

Controller.prototype.createRoute = function route(method, path, action) {
  method = method.toLowerCase();
  var self = this;
  this.routes.push({ method: method, path: path, action: action, self: self});
  this.app[method](path, this._controllerInit, function(req, res, next) {
    if (!self.actions[action]) {
      next(new Error('Unhandled action - ' + method + ' ' + action));
    } else {
      self.actions[action].handler.call(self, req, res, next);
    }
  });

  return this;
}

Controller.prototype.define = function define(name, groups, handler) {
  if (typeof groups === 'function') handler = groups, groups = [];
  this.actions[name] = { groups: groups, handler: handler };

  return this;
}

methods.forEach(function(method) {
  Controller.prototype[method] = function() {
    return this.route.apply(this, [method].concat([].slice.call(arguments)));
  };
});

Controller.prototype.direct = function(method, path /* [mw/g], fn */) {
  var args = [].slice.call(arguments),
      groups = [], item, id = createAnonymousGroupName();
  args.shift(); args.shift();
  var handler = args.pop();
  while (args.length) {
    item = args.shift();
    if (typeof item === 'string') {
      groups.push(item);
    } else {
      var anonGroup = createAnonymousGroupName();
      groups.push(anonGroup);
      this.middleware(anonGroup, item);
    }
  }
  this.define(id, groups, handler);
  this.route(method, path, id);

  return this;
}

var createAnonymousGroupName = (function() {
  var anonCount = 0;
  return function() { return 'anonymous-middleware-group-' + ++anonCount }
})();
