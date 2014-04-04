assert = require('assert');
idgen = require('idgen');

clearRedis = function clearRedis (app, done) {
  app.redis.KEYS(app.redisKey('*'), function (err, keys) {
    if (err) {
      done(err);
    }
    if (!keys || !keys.length) return done();

    var batch, multi = app.redis.MULTI(), counts = {};

    // Counts up deletes.
    keys.forEach(function (key) {
      var prefix = key.substring(0, key.indexOf(':'));
      counts[prefix] = counts[prefix] || 0;
      counts[prefix]++;
    });

    // Batch up deletes.
    while (keys.length) {
      multi.DEL(keys.splice(0, 500));
    }

    multi.exec(done);
  });
};