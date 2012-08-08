var emitter = require('events').EventEmitter;
module.exports = function() {
  var ev = new emitter();
  ev.route = '/';
  var mock = function(name) {
    ev[name] = function() {
      ev.emit.apply(ev, [name].concat([].slice.call(arguments)));
    };
  };
  ['get','post','delete','put'].forEach(mock);
  return ev;
}