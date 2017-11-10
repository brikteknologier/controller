const isRegExp = require('util').isRegExp;
const join = require('path').join;
const Router = require('router');
const RouterLayer = require('router/lib/layer');
const _ = require('underscore');
const methods = require('methods');
const cuid = require('cuid');
const parseurl = require('parseurl');

const createAnonymousGroupName = () => `anonymous-middleware-group-${cuid()}`

module.exports = function createController() {
  // an array of routes from URL paths or RegExps to actions. 
  // [ { method: 'get', path: '/user/:id', action: 'getUser', controller: 'controllerId' } ]
  const routes = [];
  // a map of actions indexed by their names
  // { getUser: { groups: ['checkAuth', 'accessors'], handler: () => {} } }
  const actions = {};
  // an array of middlewares. each middleware is a function, with "controller" and
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
  
  Controller.actions = actions;
  Controller.routes = routes;
  Controller.middlewares = middlewares;
  Controller.router = Controller.app = router;
  
  Controller._controllerId = id;
  
  // middleware entry point, the inline middleware that is passed to router
  const injectRouteScope = (req, res, next) => {
    // find a route that matches this route
    const pathname = parseurl(req).pathname;
    const route = _.find(routes, function(route) {
      var match = false;
      try { match = route.layer.match(pathname) } catch (e) {}
      return route.method === req.method.toLowerCase()
          && match
          && route.controller === id;
    });
    
    if (route) {
      // the metadata for the action, for example { groups: [], handler: ()=>{} }
      const action = actions[route.action];
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
      const layerChain = chain.map(mw => RouterLayer('/', {}, mw));
      stack.splice.apply(stack, [1, 0].concat(layerChain));
    }

    next();
  };
  
  const getMiddlewareMatchingScope = (scope) => {
    const inScope = group => ~scope.indexOf(group);
    return _.sortBy(
      collectMiddlewaresMatchingScope(Controller, scope),
      (mw) => scope.indexOf(_.find(mw.scope, inScope))
    );
  }
  
  const collectMiddlewaresMatchingScope = (controller, scope, base = []) => {
    if (controller.parent && controller.parent._controllerId) {
      base = collectMiddlewaresMatchingScope(controller.parent, scope, base);
    }

    const inScope = (group) => ~scope.indexOf(group);
    return base.concat(controller.middlewares.filter(mw => mw.scope.some(inScope)));
  }
  
  const addSubController = function (route, controller) {
    if (controller._controllerId) controller.parent = Controller;
    router.use(route, controller);
    return Controller;
  };
  
  Controller.middleware = Controller.use = function (route, controller) {
    // just assume we're mounting a subcontroller/app to start with...
    if (typeof route != 'string' && !isRegExp(route)) {
      controller = route;
      route = '/';
    }
    
    if (controller && controller._controllerId) return addSubController(route, controller);
    else if (route == '/') { route = controller; controller = undefined }
   
    // oh, not a controller? ok, proceed as normal...
    const args = _.flatten([].slice.call(arguments), true);
    const scope = [];
    const fns = [];

    while (args.length) {
      const arg = args.shift();
      if (arg == null) continue;
      (typeof arg === 'function' ? fns : scope).push(arg);
    }

    if (!scope.length) scope.push('all');
    
    fns.forEach(function(fn) {
      fn.scope = scope;
      fn.controller = id;
      middlewares.push(fn);
    });

    // Purge any related caches.
    Object.keys(chainCache).forEach(function(chain) {
      var groups = chain.split(',');
      if (!!groups.some(group => ~scope.indexOf(group))) {
        delete chainCache[chain];
      }
    });

    return Controller;
  }
  
  Controller.route = function (method, path, action) {
    method = method.toLowerCase();
    router[method](path, injectRouteScope, function(req, res, next) {
      if (!actions[action]) {
        next(new Error('Unhandled action - ' + method + ' ' + action));
      } else {      
        actions[action].handler.call(Controller, req, res, next);
      }
    });
    routes.push({ 
      method, 
      path, 
      action, 
      layer: router.stack[router.stack.length - 1], 
      controller: id 
    });

    return Controller;
  }
  
  Controller.define = function (name, groups, handler) {
    if (typeof groups == 'function') handler = groups, groups = [];
    if (Array.isArray(groups)) {
      //clear old anonymous middlewares if we're overwriting
      if (actions[name]) {
        for (let i = 0; i < middlewares.length; ++i) {
          if (!middlewares[i].anonymous || middlewares[i].scope[0] != name) continue;
          middlewares.splice(i--, 1);
        }
      }
      groups = groups.filter((group) => {
        if (typeof group == "function") {
          group.anonymous = true;
          Controller.use(name, group);
          return false;
        } else {
          return true;
        }
      })
    }

    actions[name] = { groups, handler };

    return Controller;
  }
  
  methods.forEach(function(method) {
    Controller[method] = function() {
      return Controller.route.apply(null, [method].concat([].slice.call(arguments)));
    };
  });
  
  Controller.direct = function (method, path /* [mw/g], fn */) {
    const args = [].slice.call(arguments);
    const groups = [];
    const id = createAnonymousGroupName();
    
    args.shift(); args.shift();
    const handler = args.pop();
    
    var item;
    while (args.length) {
      item = args.shift();
      if (typeof item === 'string') {
        groups.push(item);
      } else {
        const anonGroup = createAnonymousGroupName();
        groups.push(anonGroup);
        Controller.use(anonGroup, item);
      }
    }
    Controller.define(id, groups, handler);
    Controller.route(method, path, id);

    return Controller;
  }
  
  return Controller;
}
