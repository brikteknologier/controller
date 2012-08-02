var isRegExp = require('util').isRegExp;
var join = require('path').join;

var Controller = module.exports = function Controller(options) {
  if (!(this instanceof Controller)) {
    return new Controller(options);
  }
  this.options      = options || {},
  this.routes       = {},
  this.actions      = {},
  this.middlewares  = {};
}

Controller.prototype.middleware = function middleware(scope) {
  if (scope == null) scope = 'all';
  return this.middlewares[scope] || (this.middlewares[scope] = []); 
}

Controller.prototype.route = function route(method, path, action) {
  this.routes[action] = { method: method, path: path };
}

Controller.prototype.define = function define(name, groups, handler) {
  if (typeof groups === 'function') handler = groups, groups = [];
  this.actions[name] = { groups: groups, handler: handler };
}

Controller.prototype.attach = function attach(app) {
  var self = this;
  Object.keys(this.routes).forEach(function(actionName) {
    var middleware = [].concat(self.middleware());
    var action = self.actions[actionName];
    var route = self.routes[actionName];
    action.groups.concat([actionName]).forEach(function(group) {
      middleware.concat(self.middleware(group));
    });
    var path = route.path;
    if (!isRegExp(path) && self.options.prefix) {
      path = join(options.prefix, path);
    }
    app[route.method](path, middleware, action.handler);
  });
}