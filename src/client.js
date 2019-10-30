import makeSocket from 'socket.io-client'
import Observable from 'zen-observable'
import lodash from 'lodash'
import { applyPatch } from 'rfc6902'

// The main client class
function Client(config) {
  this.config = {
    url: `${window.location.origin}`,
    path: '/livequery',
    context: () => ({}),
    verbose: false,
    io: {},
    ...config
  }

  // The underlying socket.io client
  this.socket = makeSocket(this.config.url, {
    path: this.config.path,
    ...this.config.io
  })
}

// When one fires a query...
Client.prototype.query = function(query, input, context) {
  // ...the complete context is calculated...
  context = {
    $live: true,
    ...context,
    ...this.config.context(context, { query, input })
  }

  // ...if no live update is required, then a simple promise is returned
  // resolving to the query's output
  if(!context.$live)
    return new Promise(resolve => {
      this.socket.emit('query', query, input, context, output => {
        resolve(output)
      })
    })
  // ...otherwise an observable is created...
  return new Observable(observer => {
    let subscriptionId = null
    this.socket.emit('query', query, input, context, (output, id) => {
      if(!observer.closed) {
        subscriptionId = id
        observer.next(output)
        // ...subscribing to patches and generating observable values on each update
        this.socket.on(`patch/${id}`, delta => {
          applyPatch(output, delta)
          output = lodash.clone(output)
          observer.next(output)
        })
      }
    })
    return () => {
      if(subscriptionId) {
        this.socket.off(`patch/${subscriptionId}`)
        this.socket.emit('unquery', subscriptionId)
      }
    }
  })
}

// When one fires an action...
Client.prototype.action = function(action, input, context) {
  // ...the complete context is calculated...
  context = {
    ...context,
    ...this.config.context(context, { action, input })
  }
  // ...and a promise is returned, resolving to the action's output
  return new Promise(resolve => {
    this.socket.emit('action', action, input, context, output => {
      resolve(output)
    })
  })
}

export default Client
