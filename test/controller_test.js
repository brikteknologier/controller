var assert = require('assert');
var ctrl = require('../');
var app = require('./app_mock');

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
  it('should call the right routing functions', function() {
    var c = ctrl();
    var action = function someAction(){};
    var doThing = function thing(){};
    c.define('action', ['thing'], action);
    c.route('GET', '/action', 'action');

    var anapp = app();
    var didCall = false;
    anapp.on('get', function(route, mw, theAction) {
      didCall = true;
    });

    c.attach(anapp);
    assert(didCall === true);
  });
  it('should route with a prefix', function() {
    var c = ctrl({prefix: '/prefix/'});
    var action = function someAction(){};
    var doThing = function thing(){};
    c.define('action', ['thing'], action);
    c.route('GET', '/action', 'action');

    var anapp = app();
    var didCall = false;
    anapp.on('get', function(route, mw, theAction) {
      assert(route === '/prefix/action');
      didCall = true;
    });

    c.attach(anapp);
    assert(didCall === true);
  });
  describe('direct()', function() {
    it('should allow direct attachment', function() {
      var c = ctrl();
      var fn = function() {}
      c.direct('get', '/action', fn);
      var anapp = app();
      var didCall = false;
      anapp.on('get', function(route, theAction) {
        assert(fn === theAction);
        assert(route === '/action');
        didCall = true;
      });

      c.attach(anapp);
      assert(didCall === true);
    })
    it('should allow more than one direct attachment', function() {
      var c = ctrl();
      var fn = function() {}
      var fn2 = function() {}
      var fn3 = function() {}
      var fn4 = function() {}
      c.direct('get', '/action', fn3, fn);
      c.direct('post', '/action2', fn4, fn2);
      var anapp = app();
      var didCall = 0;
      anapp.on('get', function(route, mw, theAction) {
        assert(fn === theAction);
        assert(route === '/action');
        assert.deepEqual(mw, [fn3]);
        didCall++;
      });
      anapp.on('post', function(route, mw, theAction) {
        assert(fn2 === theAction);
        assert(route === '/action2');
        assert.deepEqual(mw, [fn4]);
        didCall++;
      });

      c.attach(anapp);
      assert(didCall === 2);
    })
    it('should allow direct attachment mixing groups and fns', function() {
      var c = ctrl();
      var fn = function() {};
      var fn1 = function() {};
      var fn2 = function() {};
      var fn3 = function() {};
      c.middleware('gr1', fn1);
      c.middleware('gr2', fn2);
      c.direct('get', '/action', 'gr1', fn3, 'gr2', fn);
      var anapp = app();
      var didCall = false;
      anapp.on('get',  function(route, mw, theAction) {
        assert.deepEqual(mw, [fn1, fn2, fn3])
        assert(theAction === fn)
        didCall = true;
      });

      c.attach(anapp);
      assert(didCall === true);
    })
  }); 
  describe('middleware()', function() {
    it('should return an array of middlewares when not adding', function() {
      assert(Array.isArray(ctrl().middleware()));
      var c = ctrl();
      var fn = function() {};
      c.middleware().push(fn);
      assert.deepEqual(c.middleware(), [fn]);
    });
    it('should allow for groups', function() {
      var c = ctrl();
      var fn = function() {}
      c.middleware('group').push(fn);
      assert.deepEqual(c.middleware('group'), [fn]);
    })
    it('should allow middleware to be added directly', function() {
      var c = ctrl();
      var fn = function() {}
      c.middleware('group', fn);
      assert.deepEqual(c.middleware('group'), [fn]);

      c = ctrl();
      c.middleware(fn);
      assert.deepEqual(c.middleware(), [fn]);
    })
    it('should apply grouped middleware at attach', function() {
      var c = ctrl();
      var action = function someAction(){};
      var doThing = function thing(){};
      c.define('action', ['thing'], action);
      c.middleware('thing').push(doThing);
      c.route('get', '/action', 'action');

      var anapp = app();
      var didCall = false;
      anapp.on('get', function(route, mw, theAction) {
        assert(route === '/action');
        assert.deepEqual(mw, [doThing]);
        assert(action === theAction);
        didCall = true;
      });

      c.attach(anapp);
      assert(didCall === true);
    });
    it('should apply global middleware at attach', function() {
      var c = ctrl();
      var action = function someAction(){};
      var doThing = function thing(){};
      c.define('action', ['thing'], action);
      c.middleware(doThing);
      c.route('get', '/action', 'action');

      var anapp = app();
      var didCall = false;
      anapp.on('get', function(route, mw, theAction) {
        assert.deepEqual(mw, [doThing]);
        didCall = true;
      });

      c.attach(anapp);
      assert(didCall === true);
    });
    it('should apply handler specific middleware at attach', function() {
      var c = ctrl();
      var action = function someAction(){};
      var doThing = function thing(){};
      c.define('action', ['thing'], action);
      c.middleware('action', doThing);
      c.route('get', '/action', 'action');

      var anapp = app();
      var didCall = false;
      anapp.on('get', function(route, mw, theAction) {
        assert.deepEqual(mw, [doThing]);
        didCall = true;
      });

      c.attach(anapp);
      assert(didCall === true);
    });
    it('should apply middleware in the correct order', function() {
      var c = ctrl();
      var action = function someAction(){};
      var doThing1 = function thing1(){};
      var doThing2 = function thing2(){};
      var doThing3 = function thing3(){};
      c.define('action', ['thing'], action);
      c.middleware('action', doThing3);
      c.middleware(doThing1);
      c.middleware('thing', doThing2);
      c.route('get', '/action', 'action');

      var anapp = app();
      var didCall = false;
      anapp.on('get', function(route, mw, theAction) {
        assert.deepEqual(mw, [doThing1, doThing2, doThing3]);
        didCall = true;
      });

      c.attach(anapp);
      assert(didCall === true);
    });
  })
})