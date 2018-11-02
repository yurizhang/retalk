import {
  createStore as theRealCreateStore,
  combineReducers,
  compose,
  applyMiddleware,
} from 'redux';
import createReducer from './createReducer';
import createMethods from './createMethods';
import methodsStation from './utils/methodsStation';
import isObject from './utils/isObject';
import error from './utils/error';

/**
 * createStore
 * @param {Object} models - { model: { state, actions } } or { model: () => import() }
 * @param {boolean} useReduxDevTools - Whether use Redux DevTools, only support >= 2.15.3
 * @returns {Object} Store or Promise
 */
const createStore = (models, useReduxDevTools) => {
  if (!isObject(models)) {
    throw new Error(error.NOT_OBJECT('models'));
  }

  const asyncImport = Object.values(models).some(model => typeof model === 'function');
  const rootReducers = {};

  const getStore = () => {
    const composeEnhancers =
      (useReduxDevTools === true && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__)
        ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
        : compose;
    const store = theRealCreateStore(
      combineReducers(rootReducers),
      composeEnhancers(applyMiddleware(methodsStation(models))),
    );
    Object.entries(models).forEach(([name, model]) => {
      models[name] = createMethods(store, name, model);
    });
    store.addModel = (name, model) => {
      if (name in rootReducers) return;
      rootReducers[name] = createReducer(name, model);
      store.replaceReducer(combineReducers(rootReducers));
      models[name] = createMethods(store, name, model);
    };
    return store;
  };

  // Static import
  if (!asyncImport) {
    Object.entries(models).forEach(([name, model]) => {
      rootReducers[name] = createReducer(name, model);
    });
    return getStore();
  }

  // Dynamic import
  const modelMap = {};
  return Promise.all(
    Object.entries(models).map(([name, model], index) => {
      modelMap[index] = { name };
      if (typeof model === 'function') {
        modelMap[index].async = true;
        return model();
      }
      modelMap[index].async = false;
      return model;
    }),
  ).then((modelList) => {
    modelList.forEach((model, index) => {
      const { name, async } = modelMap[index];
      if (async) {
        if (!isObject(model) || !isObject(model.default)) {
          throw new Error(error.INVALID_IMPORTER(name));
        }
        model = model.default; // eslint-disable-line
        models[name] = model;
      }
      rootReducers[name] = createReducer(name, model);
    });
    return getStore();
  });
};

/**
 * withStore
 * @param {...string} names - 'modelA', 'modelB', ...
 * @returns {Array} [mapState, mapMethods]
 */
const withStore = (...names) => {
  if (names.length === 0) {
    throw new Error(error.INVALID_MODEL_NAME());
  }
  return [
    (state) => {
      let mergedState = { loading: {} };
      for (let i = 0; i < names.length; i += 1) {
        const name = names[i];
        if (typeof name !== 'string') {
          throw new Error(error.INVALID_MODEL_NAME());
        }
        const modelState = state[name];
        mergedState = {
          ...mergedState,
          ...modelState,
          ...{ loading: { ...mergedState.loading, ...modelState.loading } },
        };
      }
      return mergedState;
    },
    (dispatch) => {
      let mergedMethods = {};
      for (let i = 0; i < names.length; i += 1) {
        const name = names[i];
        const modelMethods = dispatch[name];
        mergedMethods = { ...mergedMethods, ...modelMethods };
      }
      return mergedMethods;
    },
  ];
};

/**
 * exports
 */
export {
  createStore,
  withStore,
};
