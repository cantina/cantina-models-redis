var app = require('cantina')
  , _ = require('underscore')
  , modelerRedis = require('modeler-redis');

module.exports = function (__opts) {
  var opts = copy(__opts);
  if (!opts.client) throw new Error('must pass a redis client with options.client');
  if (!opts.name) throw new Error('must pass a collection name with options.name');

  var store = {}
    , collection = modelerRedis(opts)
    , sets = {}
    , sortedSets = {}
    , indexes = {};

  store.createUniqueIndex = function (key) {
    // Enforce unique constraint
    app.hook('model:save:' + opts.name).last(function (model, cb) {
      if (!model[key]) return cb('Error: missing indexed property ' + key);
      indexes[key] = app.redisKey('models', opts.name, 'indexes', key, model[key]);
      app.redis.GET(indexes[key], function (err, exists) {
        if (err) return cb(err);
        if (exists && exists !== model.id) return cb('Error: duplicate key for unique index ' + key);
        else {
          cb();
        }
      });
    });

    // Add an index key on save
    app.hook('model:afterSave:' + opts.name).first(function (model, cb) {
      app.redis.SET(indexes[key], model.id, cb);
    });

    // Delete the index on destroy
    app.hook('model:afterDestroy:' + opts.name).last(function (model, cb) {
      app.redis.DEL(indexes[key], cb);
    });
  };

  store.createSortedIndex = function (key) {
    // Add a key to sorted set on save
    app.hook('model:afterSave:' + opts.name).last(function (model, cb) {
      sortedSets[key] = app.redisKey('models', opts.name, 'views', key);
      app.redis.ZREM(sortedSets[key], model.id, function (err) {
        if (err) return cb(err);
        app.redis.ZADD(sortedSets[key], model[key] || 0, model.id, cb);
      });
    });

    // Delete the key on destroy
    app.hook('model:afterDestroy:' + opts.name).last(function (model, cb) {
      app.redis.ZREM(sortedSets[key], model.id, cb);
    });
  };

  store.createQueryIndex = function (key) {
    // Remove from set for old value
    app.hook('model:save:' + opts.name).last(function (model, cb) {
      if (model.__old && model.__old[key] !== model[key]) {
        var oldSet = sets[key + ':' + model.__old[key]];
        if (oldSet) {
          app.redis.SREM(oldSet, model.id, cb);
        }
        else {
          cb()
        }
      }
      else {
        cb();
      }
    });
    // Add a key to set on save
    app.hook('model:afterSave:' + opts.name).last(function (model, cb) {
      if (!model[key]) return cb();
      sets[key + ':' + model[key]] = app.redisKey('models', opts.name, 'sets', key, model[key]);
      app.redis.SADD(sets[key + ':' + model[key]], model.id, cb);
    });

    // Delete the key on destroy
    app.hook('model:afterDestroy:' + opts.name).last(function (model, cb) {
      if (!model[key]) return cb();
      app.redis.SREM(sets[key], model.id, cb);
    });
  };

  store.list = function (query, options, cb) {
    var idArr = []
      , sortedIds = []
      , latch = 0;
    if (arguments.length < 3) {
      if (typeof options === 'function') {
        cb = options;
        options = query;
        query = null;
      }
      else if (typeof query === 'function') {
        cb = query;
        options = {};
        query = null;
      }
    }

    function onDone () {
      var ids
        , arrays = [];
      if (sortedIds.length) {
        arrays.push(sortedIds);
      }
      if (idArr.length) {
        arrays = arrays.concat(idArr);
      }
      ids = _.intersection.apply(null, arrays);
      if (!ids.length) return cb(null, []);
      return collection._prepareList(ids, options.load, cb);
    }

    if (query) {
      Object.keys(query).forEach(function (key) {
        if (!sets[key + ':' + query[key]] && !indexes[key]) {
          return cb(new Error('Non indexed property `' + key + '` passed to list query'));
        }
        latch++;
        if (indexes[key]) {
          // If the key is a unique index, invoke load
          store.load(_.pick(query, key), function (err, entity) {
            if (err) return cb(err);
            return cb(null, entity ? [entity] : null);
          });
        }
        else {
          app.redis.SMEMBERS(sets[key + ':' + query[key]], function (err, ids) {
            if (err) return cb(err);
            idArr.push(ids);
            if (!--latch) onDone();
          });
        }
      });
    }
    if (options.sort) {
      latch++;
      var cmd = 'ZRANGE'
        , opts = {};

      if (!sortedSets[options.sort]) return cb(new Error('Non sortable property `' + options.sort + '` passed to list query sort'));

      opts.offset = options.offset || 0;
      opts.end = options.limit ? options.offset + options.limit : -1;

      if (options.reverse) {
        cmd = 'ZREVRANGE';
      }
      app.redis[cmd](sortedSets[options.sort], opts.offset, opts.end, function (err, results) {
        if (err) return cb(err);
        opts.offset += results.length;
        opts.end = opts.limit ? opts.offset + opts.limit : -1;
        sortedIds = results;
        if (!--latch) onDone();
      });
    }

    if (!query && !options.sort) {
      return collection.list(options, cb);
    }
  };

  store.create = function (attrs, cb) {
    return collection.create(attrs, cb);
  };

  store.save = function (entity, cb) {
    return collection.save(entity, cb);
  };

  store.load = function (id, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    options || (options = {});
    var entity;
    if ({}.toString.call(id) === '[object Object]') entity = id;
    if (entity) {
      var keys = Object.keys(entity);
      if (keys.length !== 1 || (keys[0] !== 'id' && !indexes[keys[0]])) return cb(new Error('Load query must use a single indexed property'));
      if (keys[0] !== 'id') {
        app.redis.GET(indexes[keys[0]], function (err, id) {
          if (err) return cb(err);
          if (!id) return cb();
          return collection.load(id, options, cb);
        });
      }
      else {
        return collection.load(id, options, cb);
      }
    }
    else {
      return collection.load(id, options, cb);
    }
  };

  store.destroy = function (id, options, cb) {
    return collection.destroy(id, options, cb);
  };
  return store;
};

function copy (obj) {
  var c = {};
  Object.keys(obj).forEach(function (prop) {
    c[prop] = obj[prop];
  });
  return c;
}