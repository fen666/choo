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
  var self = this
  this.router.on(route, function (params) {
    return function () {
      self.state.params = params
      var routeTiming = nanotiming("choo.route('" + route + "')")
      var res = handler(self.state, function (eventName, data) {
        self.emitter.emit(eventName, data)
      })
      routeTiming()
      return res
    }
  })
}

Choo.prototype.use = function (cb) {
  var endTiming = nanotiming('choo.use')
  cb(this.state, this.emitter, this)
  endTiming()
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

  this._tree = this.router(createLocation())
  this.emitter.prependListener('render', nanoraf(function () {
    var renderTiming = nanotiming('choo.render')
    var newTree = self.router(createLocation())

    var morphTiming = nanotiming('choo.morph')
    self._tree = nanomorph(self._tree, newTree)
    morphTiming()

    renderTiming()
  }))

  documentReady(function () {
    self.emitter.emit('DOMContentLoaded')
  })

  return this._tree
}

Choo.prototype.mount = function mount (selector) {
  assert.equal(typeof window, 'object', 'choo.mount: window was not found. .mount() must be called in a browser, use .toString() if running in Node')

  var self = this

  documentReady(function () {
    var renderTiming = nanotiming('choo.render')
    var newTree = self.start()

    var root = document.querySelector(selector)
    assert.ok(root, 'choo.mount: could not query selector: ' + selector)

    var morphTiming = nanotiming('choo.morph')
    var resultTree = nanomorph(root, newTree)
    morphTiming()

    assert.equal(resultTree, root, 'choo.mount: The target node <' +
      resultTree.nodeName.toLowerCase() + '> is not the same type as the new node <' +
      newTree.nodeName.toLowerCase() + '>.')

    self._tree = root
    renderTiming()
  })
}

Choo.prototype.toString = function (location, state) {
  this.state = state || {}

  assert.equal(typeof location, 'string', 'choo.toString: location should be type string')
  assert.equal(typeof state, 'object', 'choo.toString: state should be type object')

  var html = this.router(location)
  return html.toString()
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

function createLocation () {
  var pathname = window.location.pathname.replace(/\/$/, '')
  var hash = window.location.hash.replace(/^#/, '/')
  return pathname + hash
}
