cantina-models-redis
====================

Redis models for Cantina applications implementing a
[modeler](https://github.com/carlos8f/modeler/)-compatible API extended with
additional functionality.

Provides
========

- **app.createRedisCollection (name, options)** - a Redis collection factory

See [cantina-models](https://github.com/cantina/cantina-models) for basic
documentation.

### Extended Functionality (differences from modeler)

- **`collection.createUniqueIndex( name )`**

Adds support for model lookup by the indexed property and also enforces
uniqueness for the indexed property;

- **`collection.createQueryIndex( name )`**

Adds support for model listing by the indexed property (non-unique).

- **`collection.createSortableIndex( name )`**

Adds support for sorting model lists by the indexed property. The property may be
numeric or a string.

#### Private Properties

A collection can be created with an optional array of `privateProperties`:

```js
app.createMongoCollection('foo', {
  privateProperties: ['secret_key']
});
```

Private properties will be excluded from all models returned by the core api
methods (e.g., load). Note that if the core method was invoked with a copy of a
model with private properties present, those properties will remain present on
the model when any events and hooks are triggered.

#### Additional Query Parameters

`collection#load` and `collection#list` can optionally use the first parameter
as a query object contaning indexed properties.
So, the call signatures become:

- **`load(id|query, [callback])`**
- **`list([query], [options], callback)`** - where `options` is **required** if
`query` is provided
