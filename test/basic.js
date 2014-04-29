describe('basic', function (){

  var app
    , model;

  before(function (done) {
    app = require('cantina');
    app.boot(function(err) {
      app.conf.set('redis:prefix', 'cantina-models-redis-test-' + idgen());
      require('../');
      if (err) return done(err);
      app.start(done);
    });
  });

  after(function (done) {
    clearRedis(app, function () {
      app.destroy(done);
    });
  });

  describe('core', function () {
    it('can create a redis collection factory', function () {
      assert(app.createRedisCollection);
      assert('function' === typeof app.createRedisCollection);
    });

    it('can create a collection', function () {
      app.createRedisCollection('people', {
        indexes: [
            {email: 1, unique: true},
            {first: 1},
            {last: 1},
            {age: 1, sort: true}
          ]
      });
      assert(app.collections.people);
    });

    it('can create a model', function () {
      model = app.collections.people.create({
        first: 'Brian',
        last: 'Link',
        email: 'cpsubrian@gmail.com',
        age: 20
      });
      assert(model);
      assert(model.id);
      assert.equal(model.rev, 0);
    });
    it('can save a new model', function (done) {
      app.collections.people.save(model, function (err, brian) {
        assert.ifError(err);
        assert.equal(brian.first, 'Brian');
        assert.equal(brian.last, 'Link');
        assert.equal(brian.email, 'cpsubrian@gmail.com');
        assert.equal(model.rev, 1);
        model = brian;
        done();
      });
    });
    it('can save changes to an existing model', function (done) {
      model.first = 'Midnight';
      model.last = 'Rider';
      email = model.email;
      app.collections.people.save(model, function (err, saveModel) {
        assert.ifError(err);
        assert.equal(saveModel.first, 'Midnight');
        assert.equal(saveModel.last, 'Rider');
        assert.equal(saveModel.email, email);
        assert.equal(saveModel.rev, 2);
        done();
      });

    });
    it('can enforce a unique index', function (done) {
      app.collections.people.create({
        email: 'cpsubrian@gmail.com'
      }, function (err) {
        assert(err);
        assert(err.toString().match(/duplicate key for unique index email/));
        done();
      });
    });
    it('can load a model', function (done) {
      app.collections.people.load(model.id, function (err, loadModel) {
        assert.ifError(err);
        Object.keys(loadModel).forEach(function (prop) {
          if (prop === '_id') assert(loadModel[prop].equals(model[prop]));
          else if (prop === 'created' || prop === 'updated') assert.equal(loadModel[prop].toString(), model[prop].toString());
          else assert.equal(loadModel[prop], model[prop]);
        });
        done();
      });
    });
    it ('can load a model by an indexed property', function (done) {
      app.collections.people.load({email: model.email}, function (err, loadModel) {
        assert.ifError(err);
        Object.keys(loadModel).forEach(function (prop) {
          if (prop === '_id') assert(loadModel[prop].equals(model[prop]));
          else if (prop === 'created' || prop === 'updated') assert.equal(loadModel[prop].toString(), model[prop].toString());
          else assert.equal(loadModel[prop], model[prop]);
        });
        done();
      });
    });
    it('can list models', function (done) {
      app.collections.people.list({load: true}, function (err, list) {
        assert.ifError(err);
        assert(Array.isArray(list));
        assert.equal(list.length, 1);
        assert.equal(list[0].id, model.id);
        done();
      });
    });
    it ('can list models by indexed property', function (done) {
      app.collections.people.create({
        first: 'Midnight',
        last: 'Runner',
        email: 'runner@gmail.com',
        age: 23
      }, function (err) {
        assert.ifError(err);
        app.collections.people.create({
          first: 'Sunlight',
          last: 'Runner',
          email: 'sunrunner@gmail.com',
          age: 25
        }, function (err) {
          assert.ifError(err);
          app.collections.people.list({first: 'Midnight'}, {load: true}, function (err, list) {
            assert.ifError(err);
            assert(Array.isArray(list));
            assert.equal(list.length, 2);
            done();
          });
        });
      });
    });
    it('can list models by multiple indexed properties', function (done) {
      app.collections.people.list({first: 'Midnight', last: 'Runner'}, {load: true}, function (err, list) {
        assert.ifError(err);
        assert(Array.isArray(list));
        assert.equal(list.length, 1);
        done();
      });
    });
    it('can list sorted models', function (done) {
      app.collections.people.list({sort: 'age', load: true}, function (err, list) {
        assert.ifError(err);
        assert(Array.isArray(list));
        assert.equal(list.length, 3);
        assert(list[0].age < list[1].age);
        assert(list[1].age < list[2].age);
        done();
      });
    });
    it('can list reverse sorted models', function (done) {
      app.collections.people.list({sort: 'age', reverse: true, load: true}, function (err, list) {
        assert.ifError(err);
        assert(Array.isArray(list));
        assert.equal(list.length, 3);
        assert(list[0].age > list[1].age);
        assert(list[1].age > list[2].age);
        done();
      });
    });
    it('can list models by indexed property and sort', function (done) {
      app.collections.people.list({first: 'Midnight'}, {sort: 'age', load: true}, function (err, list) {
        assert.ifError(err);
        assert(Array.isArray(list));
        assert.equal(list.length, 2);
        assert(list[0].age < list[1].age);
        done();
      });
    });
    it('can destroy a model', function (done) {
      app.collections.people.destroy(model, function (err) {
        assert.ifError(err);
        // verify it's gone
        app.collections.people.load(model.id, function (err, loadModel) {
          assert.ifError(err);
          assert.equal(loadModel, null);
          done();
        });
      });
    });
  });

  describe('hooks', function () {
    it('emits `model:create` event', function (done) {
      app.on('model:create', function onModelCreate (model) {
        app.removeListener('model:create', onModelCreate);
        assert.equal(model.first, 'John');
        done();
      });
      app.collections.people.create({
        first: 'John',
        last: 'Doe'
      });
    });

    it('emits `model:create:[name]` event', function (done) {
      app.on('model:create:people', function onModelCreate (model) {
        app.removeListener('model:create:people', onModelCreate);
        assert.equal(model.first, 'Jane');
        done();
      });
      app.collections.people.create({
        first: 'Jane',
        last: 'Doe'
      });
    });

    it('runs `model:save` hook', function (done) {
      app.hook('model:save').add(function onHook (model, next) {
        app.hook('model:save').remove(onHook);
        model.saveHookRan = true;
        next();
      });
      app.collections.people.create({first: 'Danny', email: 'danny@test.com'}, function (err, model) {
        assert.ifError(err);
        assert.equal(model.first, 'Danny');
        assert(model.saveHookRan);
        done();
      });
    });

    it('runs `model:save:[name]` hook', function (done) {
      app.hook('model:save:people').add(function onHook (model, next) {
        app.hook('model:save:people').remove(onHook);
        model.saveHookRan = true;
        next();
      });
      app.collections.people.create({first: 'Danny', email: 'danny2@test.com'}, function (err, model) {
        assert.ifError(err);
        assert.equal(model.first, 'Danny');
        assert(model.saveHookRan);
        done();
      });
    });
  });
});