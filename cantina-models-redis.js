var redisStore = require('modeler-redis');

module.exports = function (app) {
  app.require('cantina-models');
  app.require('cantina-redis');

  app.createCollectionFactory('redis', redisStore, {client: app.redis, prefix: app.redisKey('models') + ':'});
};