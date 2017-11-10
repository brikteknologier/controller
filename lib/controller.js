const isRegExp = require('util').isRegExp;
const join = require('path').join;
const Router = require('router');
const RouterLayer = require('router/lib/layer');
const _ = require('underscore');
const methods = require('methods');
const cuid = require('cuid');

module.exports = function createController() {
  // an array of routes from URL paths or RegExps to actions. 
  // [ { method: 'get', path: '/user/:id', action: 'getUser', self: 'controllerId' } ]
  const routes = [];
  // a map of actions indexed by their names
  // { getUser: { groups: ['checkAuth', 'accessors'], handler: () => {} } }
  const actions = {};
  // an array of middlewares. each middleware is a function, with "self" and
  // "scope" properties (scope is an array of groups).
  const middlewares = [];
  // a cache of middleware chains so that a chain does not have to be calculated
  // every time a route is called.
  const chainCache = {};
  const id = cuid();
  
  const router = Router();
  
  const Controller = (req, res, next) => {
    router(req, res, next);
  };
  
  Controller._controllerId = id;
  
  // middleware entry point, the inline middleware that is passed to router
  const injectRouteScope = (req, res, next) => {
    // find a route that matches this route
    var route = _.find(self.routes, function(route) {
      return route.method === req.route.method
          && route.path === req.route.path
          && route.controller === id;
    });
    
    if (route) {
      // the metadata for the action, for example { groups: [], handler: ()=>{} }
      const action = self.actions[route.action];
      req.action = {
        key: route.action,
        groups: action.groups,
        handler: action.handler
      };
    }

    // create a scope ['all', ...scopes defined as a part of action..., 'actionName']
    var scope = ['all'];
    if (req.action) {
      scope = scope.concat(req.action.groups);
      scope.push(req.action.key);
    }
    
    // check if the middleware chain has been calculated yet. If not, or if it's
    // been invalidated, we calculate it again, clear the existing Controller
    // middleware from the route's stack, and add it again.
    const key = req.route.path + '-,' + scope.join(',');
    if (!chainCache[key]) {
      const chain = chainCache[key] = getMiddlewareMatchingScope(scope);
      
      // first we remove any existing middleware
      const stack = req.route.stack;
      for (let i = 0; i < stack.length; ++i) {
        const mw = stack[i].handle;
        if (!mw.scope) continue;
        stack.splice(i--, 1);
      }
      
      const layerChain = chain.map(mw => RouteLayer('/', {}, mw));
      stack.splice.apply(stack, [1, 0].concat(layerChain));
    }

    next();
  };
  
  const getMiddlewareMatchingScope = (scope) => {
    const inScope = group => ~scope.indexOf(group);
    return _.sortBy(
      collectMiddlewaresMatchingScope(Controller, scope),
      function(mw) { return scope.indexOf(_.find(mw.scope, inScope)) }
    );
  }
  
  const collectMiddlewaresMatchingScope = (controller, scope, base = []) => {
    if (controller.parent && controller.parent._controllerId) {
      base = collectMiddlewaresMatchingScope(this.parent, scope, base);
    }

    const inScope = (group) => ~scope.indexOf(group);
    return base.concat(middlwares.filter(mw => mw.scope.some(inScope)));
  }
  
  const addSubController = (route, controller) => {
    if (controller._controllerId) controller.parent = Controller;
    router.use(route, controller);
  };
  
  Controller.middleware = Controller.use = (route, controller) => {
    // just assume we're mounting a subcontroller/app to start with...
    if (typeof route != 'string' && !isRegExp(route)) {
      controller = route;
      route = '/';
    }
    
    if (controller && controller._controllerId) return addSubController(route, controller);
   
    // oh, not a controller? ok, proceed as normal...
    const args = _.flatten([].slice.call(arguments), true);
    const scope = [];
    const fns = [];

    while (args.length) {
      const arg = args.shift();
      (typeof arg === 'function' ? fns : scope).push(arg);
    }

    if (!scope.length) scope.push('all');
    var isAll = !!~scope.indexOf('all');

    fns.forEach(function(fn) {
      fn.scope = scope;
      fn.controller = id;
      middlewares.push(fn);
    });

    // Purge any related caches.
    Object.keys(chainCache).forEach(function(chain) {
      var groups = chain.split(',');
      if (!!groups.some(group => ~scope.indexOf(group))) {
        delete self.chainCache[chain];
      }
    });

    return Controller;
  }
  
  Controller.define = (name, groups, handler) => {
    if (typeof groups == 'function') handler = groups, groups = [];
    if (Array.isArray(groups)) {
      var self = this;
      //clear old anonymous middlewares if we're overwriting
      if (actions[name]) {
        middlewares = middlewares.filter((middleware) => {
          return !middleware.anonymous || middleware.scope[0] != name;
        });
      }
      groups = groups.filter((group) => {
        if (typeof group == "function") {
          group.anonymous = true;
          self.use(name, group);
          return false;
        } else {
          return true;
        }
      })
    }

    actions[name] = { groups: groups, handler: handler };

    return Controller;
  }
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
  var anonSeed = Math.floor(Math.random() * Math.pow(10, 10));
  return function() { return 'anonymous-middleware-group-' + ++anonSeed }
})();
