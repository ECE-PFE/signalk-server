/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Bacon = require('baconjs')
const _ = require('lodash')
const { getMetadata } = require('@signalk/signalk-schema')

function StreamBundle(app, selfId) {
  this.selfContext = 'vessels.' + selfId
  this.buses = {}
  this.allPathsBus = new Bacon.Bus()
  this.selfBuses = {}
  this.selfAllPathsBus = new Bacon.Bus()
  this.selfStreams = {}
  this.selfAllPathsStream = new Bacon.Bus()
  this.keys = new Bacon.Bus()
  this.availableSelfPaths = []
  this.app = app
  this.metaSent = {}
}

StreamBundle.prototype.pushDelta = function(delta) {
  var that = this
  function processIems(update, items, isMeta) {
    if (items) {
      items.forEach(pathValue => {
        let outgoingPath = pathValue.path
        /*
        if (isMeta) {
          outgoingPath = outgoingPath + '.meta'
        }*/
        var paths =
          pathValue.path === ''
            ? getPathsFromObjectValue(pathValue.value)
            : [outgoingPath]
        /*
          For values with empty path and object value we enumerate all the paths in the object
          and push the original delta's value to all those buses, so that subscriptionmanager
          can track hits also for paths of naked values (no path, just object value) and when
          regenerating the outgoing delta will use the unmodified, original delta pathvalue.
        */
        paths.forEach(path => {
          that.push(path, {
            path: outgoingPath,
            value: pathValue.value,
            context: delta.context,
            source: update.source,
            $source: update.$source,
            timestamp: update.timestamp,
            isMeta: isMeta
          })
        })
      }, that)
    }
  }
  try {
    if (delta.updates) {
      delta.updates.forEach(update => {
        if (update.meta) {
          processIems(update, update.meta, true)
        }
        if (update.values) {
          processIems(update, update.values, false)
        }
      }, this)
    }
  } catch (e) {
    console.error(e)
  }
}

function getPathsFromObjectValue(objectValue) {
  return Object.keys(objectValue).reduce((acc, propName) => {
    const propValue = objectValue[propName]
    if (_.isObject(propValue)) {
      accumulatePathsFromValues(acc, propName + '.', propValue)
    } else {
      acc.push(propName)
    }
    return acc
  }, [])
}

function accumulatePathsFromValues(acc, prefix, objectValue) {
  Object.keys(objectValue).forEach(propName => {
    const propValue = objectValue[propName]
    if (_.isObject(propValue)) {
      accumulatePathsFromValues(acc, `${prefix}.${propName}`, propValue)
    }
  })
}

StreamBundle.prototype.push = function(path, pathValueWithSourceAndContext) {
  if (this.availableSelfPaths.indexOf(path) === -1) {
    this.availableSelfPaths.push(path)
  }
  this.getBus().push(pathValueWithSourceAndContext)
  this.getBus(path).push(pathValueWithSourceAndContext)
  if (pathValueWithSourceAndContext.context === this.selfContext) {
    this.getSelfBus().push(pathValueWithSourceAndContext)
    this.getSelfBus(path).push(pathValueWithSourceAndContext)
    if ( !pathValueWithSourceAndContext.isMeta ) {
      this.getSelfStream().push(pathValueWithSourceAndContext.value)
      this.getSelfStream(path).push(pathValueWithSourceAndContext.value)
    }
  }
}

StreamBundle.prototype.getBus = function(path) {
  if (path !== undefined) {
    let result = this.buses[path]
    if (!result) {
      result = this.buses[path] = new Bacon.Bus()
      this.keys.push(path)
    }
    return result
  } else {
    return this.allPathsBus
  }
}

StreamBundle.prototype.getSelfStream = function(path) {
  if (path !== undefined) {
    let result = this.selfStreams[path]
    if (!result) {
      result = this.selfStreams[path] = new Bacon.Bus()
    }
    return result
  } else {
    return this.selfAllPathsStream
  }
}

StreamBundle.prototype.getSelfBus = function(path) {
  if (path !== undefined) {
    let result = this.selfBuses[path]
    if (!result) {
      result = this.selfBuses[path] = new Bacon.Bus()
    }
    return result
  } else {
    return this.selfAllPathsBus
  }
}

StreamBundle.prototype.getAvailablePaths = function() {
  return this.availableSelfPaths
}

function toDelta(normalizedDeltaData) {
  var type = normalizedDeltaData.isMeta ? 'meta' : 'values'
  let delta = {
    context: normalizedDeltaData.context,
    updates: [
      {
        source: normalizedDeltaData.source,
        $source: normalizedDeltaData.$source,
        timestamp: normalizedDeltaData.timestamp,
        [type]: [
          {
            path: normalizedDeltaData.path,
            value: normalizedDeltaData.value
          }
        ]
      }
    ]
  }
  return delta
}

module.exports = { StreamBundle, toDelta }
