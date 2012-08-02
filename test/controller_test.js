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
  it('should apply an action and middleware at a route', function() {
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
})