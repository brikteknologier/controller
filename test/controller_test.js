var assert = require('assert');
var ctrl = require('../');
var express = require('express');
var req = require('supertest');

var makemw = function(str) {
  return function(req,res,next) {
    req.string = (req.string || '') + str;
    next();
  };
}

var routestr = function(string) {
  return function(req,res) { res.end(req.string || string); };
}

describe('Controller', function() {
  it('should receive an action with no groups', function() {
    var c = ctrl();
    var action = function someAction() {};
    c.define('someAction', action);
    assert(c.actions['someAction'].handler === action);
    assert(Array.isArray(c.actions['someAction'].groups));
    assert(c.actions['someAction'].groups.length === 0);
  });
  it('should receive an action with groups', function() {
    var c = ctrl();
    var action = function someAction() {};
    c.define('someAction', ['something', 'else'], action);
    assert(c.actions['someAction'].handler === action);
    assert(Array.isArray(c.actions['someAction'].groups));
    assert.deepEqual(c.actions['someAction'].groups, ['something', 'else']);
  });
  it('should create a route', function(done) {
    var c = ctrl();
    c.define('action', ['thing'], routestr('test'));
    c.route('GET', '/action', 'action');

    req(express().use(c))
      .get('/action')
      .expect(200)
      .expect('test')
      .end(done);
  });
  it('should allow chaining', function(done) {
    var c = ctrl();
    var app = express().use(
      c.define('action', ['thing'], routestr('test'))
       .define('action2', ['other_thing'], routestr('test2'))
       .middleware('thing', makemw('thing1'))
       .middleware('other_thing', makemw('thing2'))
       .route('GET', '/action', 'action')
       .route('GET', '/other', 'action2')
    )
    req(app)
      .get('/action')
      .expect(200)
      .expect('thing1')
      .end(function(err) {
        if (err) return done(err);
        req(app)
          .get('/other')
          .expect(200)
          .expect('thing2')
          .end(done);
      });
  })
  it('should allow app nesting', function(done) {
    var c = ctrl();
    var c0 = ctrl();

    c.direct('get', '/action', routestr('test'));

    var app = express();

    c0.use('/second/', c);
    app.use('/first/', c0);

    req(app)
      .get('/first/second/action')
      .expect(200)
      .expect('test')
      .end(done);
  });
  it('should route with a prefix from middleware', function(done) {
    var c = ctrl();
    c.define('action', ['thing'], routestr('test'));
    c.route('GET', '/action', 'action');

    req(express().use('/prefix/', c))
      .get('/prefix/action')
      .expect(200)
      .expect('test')
      .end(done);
  })
  it('should route with a prefix from middleware after adding', function(done) {
    var c = ctrl();

    var app = express().use('/prefix/', c);
    c.define('action', ['thing'], routestr('test'));
    c.route('GET', '/action', 'action');

    req(app)
      .get('/prefix/action')
      .expect(200)
      .expect('test')
      .end(done);
  })
  it('should still have a the `route` fn after attachment', function(done) {
    var c = ctrl();
    c.define('action', ['thing'], routestr('test'));
    c.route('GET', '/action', 'action');
    var app = express().use('/prefix/', c)

    req(app)
      .get('/prefix/action')
      .expect(200)
      .expect('test')
      .end(function(err) {
        if (err) return done(err);

        c.route('GET', '/action2', 'action');
        req(app)
          .get('/prefix/action2')
          .expect(200)
          .expect('test')
          .end(done);
      });

  })
  describe('direct()', function() {
    it('should allow direct attachment', function(done) {
      var c = ctrl();
      c.direct('get', '/action', routestr('test'));

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('test')
        .end(done);
    })
    it('should allow more than one direct attachment', function(done) {
      var c = ctrl();
      c.direct('get', '/action', makemw('getact'), routestr('1'));
      c.direct('post', '/other', makemw('get2'), routestr('2'));

      var app = express().use(c);
      req(app)
        .get('/action')
        .expect(200)
        .expect('getact')
        .end(function(err) {
          if (err) return done(err);
          req(app)
            .post('/other')
            .expect(200)
            .expect('get2')
            .end(done);
        });
    })
    it('should allow direct attachment mixing groups and fns', function(done) {
      var c = ctrl();
      c.middleware('gr1', makemw('1mw'));
      c.middleware('gr2', makemw('2mw'));
      c.direct('get', '/action', 'gr1', makemw('imw'), 'gr2', routestr('str'));
      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('1mwimw2mw')
        .end(done);
    })
  });
  describe('middleware()', function() {
    it('should apply grouped middleware', function(done) {
      var c = ctrl();
      c.define('action', ['thing'], routestr('thing'));
      c.middleware('thing', makemw('thingmw'));
      c.route('get', '/action', 'action');

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('thingmw')
        .end(done);
    });
    it('should apply ungrouped middleware', function(done) {
      var c = ctrl();
      c.define('action', [makemw('thingmw')], routestr('thing'));
      c.route('get', '/action', 'action');

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('thingmw')
        .end(done);
    });
    it('should override ungrouped middleware', function(done) {
      var c = ctrl();
      c.define('action', [makemw('thingmw')], routestr('thing'));
      c.define('action', [makemw('thingmw2')], routestr('thing'));
      c.route('get', '/action', 'action');

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('thingmw2')
        .end(done);
    });
    it('should apply grouped middleware with use()', function(done) {
      var c = ctrl();
      c.define('action', ['thing'], routestr('thing'));
      c.use('thing', makemw('thingmw'));
      c.route('get', '/action', 'action');

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('thingmw')
        .end(done);
    });
    it('should apply global middleware with use()', function(done) {
      var c = ctrl();
      c.define('action', ['thing'], routestr('string'));
      c.use(makemw('otherthing'));
      c.route('get', '/action', 'action');

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('otherthing')
        .end(done);
    });
    it('should apply global middleware', function(done) {
      var c = ctrl();
      c.define('action', ['thing'], routestr('string'));
      c.middleware(makemw('otherthing'));
      c.route('get', '/action', 'action');

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('otherthing')
        .end(done);
    });
    it('should apply handler specific middleware', function(done) {
      var c = ctrl();
      c.define('action', ['thing'], routestr('string'));
      c.middleware('action', makemw('thingy'));
      c.route('get', '/action', 'action');

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('thingy')
        .end(done);
    });
    it('should apply global middleware to subcontrollers', function(done) {
      var c0 = ctrl();
      var c1 = ctrl();

      c0.use('/stuff', c1);

      c1.define('action', ['thing'], routestr('string'));
      c0.use(makemw('thingy'));
      c1.route('get', '/action', 'action');

      req(express().use(c0))
        .get('/stuff/action')
        .expect(200)
        .expect('thingy')
        .end(done);
    });
    it('should apply grouped middleware to subcontrollers', function(done) {
      var c0 = ctrl();
      var c1 = ctrl();

      c0.use('/stuff', c1);

      c1.define('action', ['thing'], routestr('string'));
      c0.use('thing', makemw('thingy'));
      c1.route('get', '/action', 'action');

      req(express().use(c0))
        .get('/stuff/action')
        .expect(200)
        .expect('thingy')
        .end(done);
    });
    it('should apply grouped middleware to subcontrollers in the correct order', function(done) {
      var c0 = ctrl();
      var c1 = ctrl();

      c0.use('/stuff', c1);

      c1.define('action', ['thing', makemw('mw5')], routestr('string'));
      c1.use(makemw('mw1'));
      c0.use('thing', makemw('mw2'));
      c1.use('thing', makemw('mw3'));
      c0.use(makemw('mw4'));
      c1.route('get', '/action', 'action');

      req(express().use(c0))
        .get('/stuff/action')
        .expect(200)
        .expect('mw4mw1mw2mw3mw5')
        .end(done);
    });
    it('should keep the same middleware for two routes', function(done) {
      var c = ctrl();
      c.define('action', ['thing'], routestr('str'));
      c.middleware('thing', makemw('mw'));

      c.get('/action-1', 'action');
      c.get('/action-2', 'action');

      var a = express().use(c);
      req(a)
        .get('/action-1')
        .expect(200)
        .expect('mw')
        .end(function(err ) {
          assert(!err);
          req(a)
            .get('/action-2')
            .expect(200)
            .expect('mw')
            .end(done);
        });
    });
    it('should apply middleware in the correct order', function(done) {
      var c = ctrl();
      c.define('action', ['thing', makemw('mw9')], routestr('str'));
      c.middleware('thing', makemw('mw2'));
      c.middleware('thing', makemw('mw3'));
      c.middleware('thing', makemw('mw4'));
      c.middleware(makemw('mw1'));
      c.middleware(makemw('mw7'));
      c.middleware(makemw('mw8'));
      c.middleware('action', makemw('mw0'));
      c.middleware('action', makemw('mw5'));
      c.middleware('action', makemw('mw6'));
      c.route('get', '/action', 'action');

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('mw1mw7mw8mw2mw3mw4mw9mw0mw5mw6')
        .end(done);
    });
  })
})
