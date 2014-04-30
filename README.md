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
* [Middleware Groups](#groups)
* [Middleware Ordering](#ordering)
* [define](#define) - define handlers
* [middleware](#middleware) - add middleware for handlers
* [route](#route) - route handlers
* [direct](#direct) - directly route a handler function
* [Mounting controllers on controllers & middleware inheritance](#inheritance)

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

<a name="groups"/>
### Middleware Groups

Controller introduces the idea of middleware groups. This allows to you specify
named groups, and apply to middleware to every handler that is labelled with
this group. For example, you might have bunch of handlers that require you to 
be logged in, and some middleware which checks authentication. You could add
all of the handlers to the 'require-login' group, and then add your auth
middleware to the 'reguire-login' group. This will now apply that middleware to
every handler in the group.

In action:
```javascript
var stuff = controller();

// define handlers with their groups
stuff.define('sensitive-thing', ['require-login'], function(req,res){});
stuff.define('secret-thing', ['require-login'], function(req,res){});

// define middleware for the group
stuff.middleware('require-login', function(req, res, next) {
  if (isAuthenticated(req)) {
    next();
  } else {
    res.send(403);
  }
})
```

__Special Groups__

There are some special groups by default. The first one is `all`, which applies
middleware to every action on this controller. Apart from that, every action
name is also a middleware group, so you can add middleware to individual actions

<a name="ordering"/>
__Middleware Ordering__

Middlewares are called in the following order:

1. `'all'` grouped middleware is executed first. (in the order they were added)
2. all other groups are then executed in the order they were added to the route
   with `route` or `direct`. within the group, middlewares are executed in the
   order they were added.
3. route specific middleware (including middleware added inline on a `define`
   call) is then executed in the order it was added.

For example:

```javascript
app.define('action', ['thing', MIDDLEWARE_1], routestr('str')); // inline middleware
app.use('thing', MIDDLEWARE_2); // group middleware
app.use('thing', MIDDLEWARE_3); // group middleware
app.use(MIDDLEWARE_4); // global middleware
app.use(MIDDLEWARE_5); // global middleware
app.use('action', MIDDLEWARE_6); // route specific middleware
app.use('action', MIDDLEWARE_7); // route specific middleware
app.route('get', '/action', 'action');
```

The call order of middleware in this example would be:

```
1. MIDDLEWARE_4 (global middleware)
2. MIDDLEWARE_5 (global middleware)
3. MIDDLEWARE_2 (group middleware)
4. MIDDLEWARE_3 (group middleware)
5. MIDDLEWARE_1 (route-specific middleware)
6. MIDDLEWARE_6 (route-specific middleware)
7. MIDDLEWARE_7 (route-specific middleware)
```

__Special ordering conditions__

* Route names can be group names too. In the previous example, if I was to specify
  `'action'` as the group for another route, the middleware added for `'action'`—
  both inline and procedurally—will be called with group precedence, not route-
  specific precedence. Route-specific precedence only applies to the middleware
  added specifically for the current route.

<a name="define"/>
### define(name, [groups], handler)

Define a handler. A handler is a function that is called as the result of a
route being visited. This does not route the handler, it only creates it, ready
for routing. 

__Parameters__
* `name` - the name of the handler
* `middleware/groups` *(optional)* - an array of middleware or groups to add this
  handler to. Array can contain either strings (middleware group) or functions
  (inline route-specific middleware) or a mixture of the two. For more details
  on the order in which these middlewares are called, see the [ordering](#ordering)
  section.
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
### direct(method, path, [middleware\*/groups\*,] handlerfn)

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

<a name="inheritance"/>
### Mounting controllers on controllers & middleware inheritance

You can mount a controller on another controller like so:

```javascript
var appController = Controller();
var usersController = Controller();

appController.use('/users', usersController);
```

The path (in this case, `'/users'`) is optional, but it usually makes senses.

Mounting controllers on each other in this way will cause middleware inheritance.
In our above example, this means that `usersController` will inherit groups and
middlewares from `appController`. If I set a global middleware on `appController`,
`usersController` will get it too. This means that, for example, if I have a
group `'auth'` on `appController`, I can use it as normal on `usersController`:

```javascript
usersController.define('editUser', ['auth'], function(req, res) { ... });
appController.middleware('auth', function(req, res, next) { ... });
```

##### Middleware ordering when using inheritance

The run order of middleware is slightly different when utilising inheritance.
Normally, the global middleware runs first, then the middleware in the order 
specified on `define`. When utilising inheritance, this is still true, but within
a group, the lowest level of inheritance will run first.

The easiest way to demonstrate this is to show an example. Lets say we have 3
controllers inheriting from each other, such as this:

```javascript
usersController.use('/cats', catController);
appController.use('/users', usersController);
```

Now, lets say that each of these 3 controllers have one global middleware:

```javascript
appController.middleware(function(req, res, next) { console.log('app'); next() });
usersController.middleware(function(req, res, next) { console.log('users'); next() });
catController.middleware(function(req, res, next) { console.log('meow'); next() });
```

Lets also say that each of these 3 controllers have one middleware in a group
called `'auth'`.

```javascript
appController.middleware('auth', function(req, res, next) { console.log('app (auth)'); next() });
usersController.middleware('auth', function(req, res, next) { console.log('users (auth)'); next() });
catController.middleware('auth', function(req, res, next) { console.log('meow (auth)'); next() });
```

And we have a route which consumes these middlewares:

```javascript
catController.direct('get', '/meow', ['auth'], function(req, res) {
  res.end('MEOW');
});
```

When we send a request to `/users/cats/meow`, the output would be as follows:

```
app
users
meow
app (auth)
users (auth)
meow (auth)
```

So the middleware group order was:

```
appController [global]
usersController [global]
meowController [global]
appController [auth]
usersController [auth]
meowController [auth]
```

The ordering in which lower levels of middleware are called will not change,
regardless of the order they are added in.
