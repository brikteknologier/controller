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
    it('should apply middleware in the correct order', function(done) {
      var c = ctrl();
      c.define('action', ['thing'], routestr('str'));
      c.middleware('thing', makemw('mw2'));
      c.middleware(makemw('mw1'));
      c.middleware('action', makemw('mw0'));
      c.route('get', '/action', 'action');

      req(express().use(c))
        .get('/action')
        .expect(200)
        .expect('mw1mw2mw0')
        .end(done);
    });
  })
})