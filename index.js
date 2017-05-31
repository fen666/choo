var documentReady = require('document-ready')
var nanotiming = require('nanotiming')
var nanorouter = require('nanorouter')
var nanomorph = require('nanomorph')
var nanohref = require('nanohref')
var nanoraf = require('nanoraf')
var nanobus = require('nanobus')
var assert = require('assert')

module.exports = Choo

function Choo (opts) {
  if (!(this instanceof Choo)) return new Choo(opts)
  opts = opts || {}

  assert.equal(typeof opts, 'object', 'choo: opts should be type object')

  var routerOpts = {
    default: opts.defaultRoute || '/404',
    curry: true
  }

  // properties for internal use only
  this._historyEnabled = opts.history === undefined ? true : opts.history
  this._hrefEnabled = opts.href === undefined ? true : opts.href
  this._tree = null

  // properties that are part of the API
  this.router = nanorouter(routerOpts)
  this.emitter = nanobus('choo.emit')
  this.state = {}
}

Choo.prototype.route = function (route, handler) {
  assert.equal(typeof route, 'string', 'choo.route: route should be type string')
  assert.equal(typeof handler, 'function', 'choo.handler: route should be type function')

  var self = this
  this.router.on(route, function (params) {
    return function () {
      self.state.params = params
      var routeTiming = nanotiming("choo.route('" + route + "')")
      var res = handler(self.state, function (eventName, data) {
        self.emitter.emit(eventName, data)
      })
      routeTiming(self._trace.bind(self))
      return res
    }
  })
}

Choo.prototype.use = function (cb) {
  assert.equal(typeof cb, 'function', 'choo.use: cb should be type function')
  var endTiming = nanotiming('choo.use')
  cb(this.state, this.emitter, this)
  endTiming(this._trace.bind(this))
}

Choo.prototype.start = function () {
  assert.equal(typeof window, 'object', 'choo.start: window was not found. .start() must be called in a browser, use .toString() if running in Node')

  var self = this

  if (this._historyEnabled) {
    window.onpopstate = function () {
      self.emitter.emit('pushState')
    }

    this.emitter.prependListener('pushState', function (href) {
      if (href) window.history.pushState({}, null, href)
      self.emitter.emit('render')
      setTimeout(scrollIntoView, 0)
    })

    this.emitter.prependListener('replaceState', function (href) {
      if (href) window.history.replaceState({}, null, href)
      self.emitter.emit('render')
      setTimeout(scrollIntoView, 0)
    })

    if (self._hrefEnabled) {
      nanohref(function (location) {
        var href = location.href
        var currHref = window.location.href
        if (href === currHref) return
        self.emitter.emit('pushState', href)
      })
    }
  }

  var location = this._createLocation()
  this._tree = this.router(location)
  assert.ok(this._tree, 'choo.start: no valid DOM node returned for location ' + location)

  this.emitter.prependListener('render', nanoraf(function () {
    var renderTiming = nanotiming('choo.render')
    var newTree = self.router(self._createLocation())

    var morphTiming = nanotiming('choo.morph')
    self._tree = nanomorph(self._tree, newTree)
    assert.ok(self._tree, 'choo.render: no valid DOM node returned for location ' + location)
    morphTiming(self._trace.bind(self))

    renderTiming(self._trace.bind(self))
  }))

  documentReady(function () {
    self.emitter.emit('DOMContentLoaded')
  })

  return this._tree
}

Choo.prototype.mount = function mount (selector) {
  assert.equal(typeof window, 'object', 'choo.mount: window was not found. .mount() must be called in a browser, use .toString() if running in Node')
  assert.equal(typeof selector, 'string', 'choo.mount: selector should be type string')

  var self = this

  documentReady(function () {
    var renderTiming = nanotiming('choo.render')
    var newTree = self.start()

    var root = document.querySelector(selector)
    assert.ok(root, 'choo.mount: could not query selector: ' + selector)

    var morphTiming = nanotiming('choo.morph')
    var resultTree = nanomorph(root, newTree)
    morphTiming(self._trace.bind(self))

    assert.equal(resultTree, root, 'choo.mount: The target node <' +
      resultTree.nodeName.toLowerCase() + '> is not the same type as the new node <' +
      newTree.nodeName.toLowerCase() + '>.')

    self._tree = root
    renderTiming(self._trace.bind(self))
  })
}

Choo.prototype.toString = function (location, state) {
  this.state = state || {}

  assert.equal(typeof location, 'string', 'choo.toString: location should be type string')
  assert.equal(typeof this.state, 'object', 'choo.toString: state should be type object')

  var html = this.router(location)
  assert.ok(html, 'choo.toString: no valid value returned for the route ' + location)
  return html.toString()
}

Choo.prototype._trace = function (timing, name) {
  if (timing) timing.__name = name
  this.emitter.emit('trace', timing)
}

function scrollIntoView () {
  var hash = window.location.hash
  if (hash) {
    try {
      var el = document.querySelector(hash)
      if (el) el.scrollIntoView(true)
    } catch (e) {}
  }
}

Choo.prototype._createLocation = function () {
  var pathname = window.location.pathname.replace(/\/$/, '')
  var hash = window.location.hash.replace(/^#/, '/')
  return pathname + hash
}
