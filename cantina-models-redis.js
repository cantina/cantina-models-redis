var app = require('cantina')
  , redisStore = require('./lib/redis-store');

require('cantina-models');
require('cantina-redis');

app.createCollectionFactory('redis', redisStore, {client: app.redis, prefix: app.redisKey('models') + ':'});