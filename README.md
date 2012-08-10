# controller
a structural aid for creating express routes.

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
users.middleware(function(req, res, next) {});
// Define middleware for 'view-account'
users.middleware('view-account', function(req, res, next) {})

// Define routes
users.get('/secret-stuff/:id', 'secret-stuff');
users.put('/user/edit/:id', 'edit-account');
users.get('/user/:id', 'view-account');
users.get('/view-user/:id', 'view-account');

// Attach to the app
app.use(users);
```

## documentation

* [Usage](#constructor)
* [define](#define) - define handlers
* [middleware](#middleware) - add middleware for handlers
* [route](#route) - route handlers
* [direct](#direct) - directly route a handler function

---

<a name="constructor"/>
### Usage

Create a new controller by requiring controller and calling it as a function,
like this:

```javascript
var controller = require('controller');
var users = controller();
```

Then attach it to an instance of express, as if it were middleware:

```javascript
var app = require('express')();
app.use(users);

// It also works to attach it with a route, which will prefix all of the routes 
// in the controller with that path.

app.use('/users/', users);
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
### middleware(group\*, middleware\*)

Define some middleware(s) for a group(s). More than one middleware can be
passed, as well as more than one group. If you were to pass two groups and two
middlewares, each middleware would be added to both groups.

`group` has some special values. `'all'` indicates that the middleware should
apply to every route on this controller. If you pass the name of an action as
the group, the middleware will apply to that action only.

__Paramaters__
* `group` - defaults to `'all'`
* `middleware` - middleware to add to `group`.

__Middleware Execution Order__

1. `'all'` grouped middleware is executed first.
2. all other groups are then executed in the order they were added to the route
   with `route` or `direct`. within the group, middlewares are executed in the
   order they were added.
3. route specific middleware is then executed in the order it was added.

__Example__

```javascript
users.middleware('auth', function checkAuthd(req, res, next) {
  // check some auth
});

// Define some middleware for all routes
users.middleware(function(res, req, next) {});

// Define some middleware for the 'getUser' action
users.middleware('getUser', function(req, res, next) {});
```

---

<a name="route"/>
### route(method, path, handlerName)

Route a handler. Handlers can be routed at more than one location. Just like
express, you can also use this method directly on the controller (see example).

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

// or directly on the controller
users.get('/user/:id', 'view')
users.post('/user/:id', 'create');
users.delete('/user/:id', 'delete');
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

