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
    , indexes = {};

  if (opts.indexes) {

    // Set up the indexes
    opts.indexes.forEach(function (index) {
      var key = Object.keys(index)[0];

      if (index.unique) {

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
      }
      else {

        // Add a
        app.hook('model:afterSave:' + opts.name).last(function (model, cb) {
          if (!model[key]) return cb();
          sets[key + ':' + model[key]] = app.redisKey('models', opts.name, 'sets', key, model[key]);
          app.redis.SADD(sets[key + ':' + model[key]], model.id, cb);
        });
        app.hook('model:afterDestroy:' + opts.name).last(function (model, cb) {
          if (!model[key]) return cb();
          app.redis.SREM(sets[key], model.id, cb);
        });
      }
    });
  }

  store.list = function (query, options, cb) {
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
    if (query) {
      var keys = Object.keys(query)
        , idArr = []
        , latch = 0;

      function onDone () {
        var ids = _.intersection.apply(null, idArr);
        if (!ids.length) return cb();
        return collection._prepareList(ids, options.load, cb);
      }

      keys.forEach(function (key) {
        var set = sets[key + ':' + query[key]];
        var index = indexes[key];
        if (!set && !index) return cb(new Error('Non indexed property `' + key + '` passed to list query'));
        latch++;
        if (index) {
          store.load(_.pick(query, key), function (err, entity) {
            if (err) return cb(err);
            return cb(null, entity ? [entity] : null);
          });
        }
        else {
          app.redis.SMEMBERS(set, function (err, ids) {
            if (err) return cb(err);
            idArr.push(ids);
            if (!--latch) onDone();
          });
        }
      });
    }
    else {
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