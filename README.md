# controller
a small structural aid for creating express routes.

## example

This code sets up an app with 3 handlers, 4 routes, and some middleware which
applies to different handler groups.

```javascript
var express = require('express');
var controller = require('controller');

var app = express();
var users = controller();

// Define handlers
users.define('secret-stuff', ['sensitive'], function(req, res) {});
users.define('edit-account', ['sensitive'], function(req, res) {});
users.define('view-account', function(req, res) {});

// Define middleware for all 'sensitive' grouped handlers
users.middleware('sensitive', function(req, res, next) {});
// Define middleware for all handlers on this controller
users.middleware('all', function(req, res, next) {});

// Define routes
users.route('get', '/secret-stuff/:id', 'secret-stuff');
users.route('put', '/user/edit/:id', 'edit-account');
users.route('get', '/user/:id', 'view-account');
users.route('get', '/view-user/:id', 'view-account');

// Attach to the app
users.attach(app);
```

## documentation

* [Create a new controller](#constructor)
* [define](#define) - define handlers
* [middleware](#middleware) - add middleware for handlers
* [route](#route) - route handlers
* [direct](#direct) - directly route a handler function
* [attach](#attach) - attach to express

---

<a name="constructor"/>
### Create a new controller

Create a new controller by requiring controller and calling it as a function,
like this:

```javascript
var controller = require('controller');
var users = controller();
```

The `Controller` function can also take an `options` paramete. Available
options are:

* `prefix` a path to prefix all routes by. For example, you could set this to
  `'/user/'`, resulting in `users.route('get', 'login', 'do-login');` routing to
  `/user/login`. 

Example with options:

```javascript
var users = controller({ prefix: '/user/' });

users.direct('get', '/:id', function(req,res) {
  res.send(Users.read(req.params.id));
})
```

---

<a name="define"/>
### define(name, [groups], handler)

Define a handler. A handler is a function that is called as the result of a
route being visited. This does not route the handler, it only creates it, ready
for routing. 

__Parameters__
* `name` - the name of the handler
* `groups` *(optional)* - the groups to add this handler to, for the purpose of
  applying middleware to groups of handlers.
* `handler` - the function that is called when the route is visited.

__Example__

```javascript
users.define('view', function(req, res) {
  res.send(Users.read(req.params.id));
});

users.define('edit', ['require-login'], function(req, res) {
  Users.update(req.params.id, req.body);
  res.send(200);
});
```

---

<a name="middleware"/>
### middleware([group, [middleware]])

Define some middleware for a group. If `middleware` is not defined, an array of 
middleware for the group is returned instead.

The order that middleware is added is as follows:

1. Controller-wide middleware under the 'all' group.
2. Group middleware, in the order the middleware was added, in the order the
   groups were specified when the handler was defined.
3. Handler-specific middleware that was defined only for this handler.

__Paramaters__
* `group` *optional* - defaults to `'all'`
* `middleware` *optional* - middleware to add to `group`.

__Example__

```javascript
users.middleware('require-login', function checkLoggedIn(req, res, next) {
  // -> check if the user is logged in
});

users.middleware('require-login'); // -> [ [Function checkLoggedIn] ]

// Define some middleware for all routes
users.middleware(function(res, req, next) {});
```

---

<a name="route"/>
### route(method, path, handlerName)

Route a handler. Handlers can be routed at more than one location.

__Parameters__
* `method`. The http method, for example `'get'`, `'post'`, `'put'`, etc.
* `path`. The path to route the handler to, in exactly the same format you would
  pass to express. You can use a regex, but it will ignore `options.prefix`.
* `handlerName`. The name of the handler to route.

__Example__
```javascript
users.route('get', '/user/:id', 'view');
users.route('post', '/user/:id', 'create');
users.route('put', '/user/:id', 'edit');
```

---

<a name="direct"/>
### direct(method, path, [middleware/groups...,] handlerfn)

Directly route a function optionally with some middleware. This is essentially
the same as adding a route directly to express. The difference is that handlers
defined with `direct` can be included in the controller's middleware groups, and
will be included in the `all` group. 

__Paramaters__
* `method`. The http method, for example `'get'`, `'post'`, `'put'`, etc.
* `path`. The path to route the handler to, in exactly the same format you would
  pass to express. You can use a regex, but it will ignore `options.prefix`.
* `middleware/groups`. A bunch of middlewares or groups to add the route to.
  These can be mixed and matched, Controller will figure it out.
* `handlerfn`. The handler function to call when the route is visited.

__Example__
```javascript
var uselessMiddleware = function(req,res,next) { next(); };

users.direct('delete', '/user/:id', uselessMiddleware, 'require-login', function(req, res) {
  Users.delete(req.params.id);
  res.end();
});

users.direct('get', '/user/do-something', function(req, res) {});
```

---

<a name="attach"/>
### attach(expressApp)

Attach the routes to an express app. Note that after calling this function,
making changes to the routes the controller will do nothing.

