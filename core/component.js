'use strict'

const observer = require('@risingstack/nx-observe')
const validateConfig = require('./validateConfig')
const getContext = require('./getContext')
const onNodeAdded = require('./onNodeAdded')
const onNodeRemoved = require('./onNodeRemoved')
const symbols = require('./symbols')

const secret = {
  config: Symbol('component config'),
  contentWatcher: Symbol('content watcher')
}
const contentWatcherConfig = {
  childList: true,
  subtree: true
}

module.exports = function component (rawConfig) {
  return {use, useOnContent, register, [secret.config]: validateConfig(rawConfig)}
}

function use (middleware) {
  if (typeof middleware !== 'function') {
    throw new TypeError('first argument must be a function')
  }
  this[secret.config].middlewares.push(middleware)
  return this
}

function useOnContent (contentMiddleware) {
  if (typeof contentMiddleware !== 'function') {
    throw new TypeError('first argument must be a function')
  }
  this[secret.config].contentMiddlewares.push(contentMiddleware)
  return this
}

function register (name) {
  if (typeof name !== 'string') {
    throw new TypeError('first argument must be a string')
  }
  const parentProto = this[secret.config].element ? this[secret.config].elementProto : HTMLElement.prototype
  const proto = Object.create(parentProto)
  proto[secret.config] = this[secret.config]
  proto.attachedCallback = attachedCallback
  proto.detachedCallback = detachedCallback
  return document.registerElement(name, {prototype: proto, extends: this[secret.config].element})
}

function attachedCallback () {
  const config = this[secret.config]
  if (!this[symbols.registered]) {
    if (typeof config.state === 'object') {
      this[symbols.state] = config.state
    } else if (config.state) {
      this[symbols.state] = observer.observable()
    } else if (config.state === 'inherit') {
      this[symbols.state] = observer.observable()
      this[symbols.inheritState] = true
    }

    this[symbols.isolate] = config.isolate
    this[symbols.contentMiddlewares] = config.contentMiddlewares
    this[symbols.middlewares] = config.middlewares
    this[symbols.root] = config.root
    this[symbols.registered] = true

    if (config.root) {
      this[secret.contentWatcher] = new MutationObserver(onMutations)
      this[secret.contentWatcher].observe(this, contentWatcherConfig)
    }
    // it might be synchronous -> doesn't belong here -> should add it to the queue
    if (!this[symbols.lifecycleStage]) {
      onNodeAdded(this, getContext(this.parentNode))
    }
  }
}

function detachedCallback () {
  if (this[secret.contentWatcher]) {
    this[secret.contentWatcher].disconnect()
  }
  onNodeRemoved(this)
}

function onMutations (mutations, contentWatcher) {
  let context
  let prevTarget
  for (let mutation of mutations) {
    if (prevTarget !== mutation.target) {
      context = getContext(mutation.target)
      prevTarget = mutation.target
    }
    for (let i = mutation.removedNodes.length; i--;) {
      onNodeRemoved(mutation.removedNodes[i])
    }
    for (let i = mutation.addedNodes.length; i--;) {
      onNodeAdded(mutation.addedNodes[i], context)
    }
  }
}
