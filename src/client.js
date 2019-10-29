import makeSocket from 'socket.io-client'
import Observable from 'zen-observable'
import lodash from 'lodash'
import { applyPatch } from 'rfc6902'

function Client(config) {
  this.config = {
    url: `${window.location.origin}`,
    path: '/livequery',
    context: () => ({}),
    verbose: false,
    io: {},
    ...config
  }

  this.subscriptions = {}

  // The underlying socket.io client
  this.socket = makeSocket(this.config.url, {
    path: this.config.path,
    ...this.config.io
  })

  this.socket.on('patch', this.handlePatch.bind(this))
}

Client.prototype.query = function(query, input, context) {
  return new Observable(observer => {
    let subscriptionId = null
    const finalContext = {
      $live: true,
      ...context,
      ...this.config.context(context, { query, input })
    }
    this.socket.emit('query', query, input, finalContext, (output, id) => {
      if(!observer.closed) {
        observer.next(output)
        if(!finalContext.$live)
          observer.complete()
        else {
          subscriptionId = id
          this.subscriptions[id] = delta => {
            applyPatch(output, delta)
            output = lodash.clone(output)
            observer.next(output)
          }
        }
      }
    })
    return () => {
      if(finalContext.$live && subscriptionId) {
        delete this.subscriptions[subscriptionId]
        this.socket.emit('unquery', subscriptionId)
      }
    }
  })
}

Client.prototype.action = function(action, input, context) {
  context = {
    ...context,
    ...this.config.context(context, { action, input })
  }
  return new Promise(resolve => {
    this.socket.emit('action', action, input, context, output => {
      resolve(output)
    })
  })
}

Client.prototype.handlePatch = function(id, delta) {
  if(this.subscriptions[id])
    this.subscriptions[id](delta)
}

export default Client
