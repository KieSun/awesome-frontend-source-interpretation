## Vuex 思想

在解读源码之前，先来简单了解下 Vuex 的思想。

Vuex 全局维护着一个对象，使用到了单例设计模式。在这个全局对象中，所有属性都是响应式的，任意属性进行了改变，都会造成使用到该属性的组件进行更新。并且只能通过 `commit` 的方式改变状态，实现了单向数据流模式。

## Vuex 解析

### Vuex 安装

在看接下来的内容前，推荐本地 clone 一份 Vuex 源码对照着看，便于理解。

在使用 Vuex 之前，我们都需要调用 `Vue.use(Vuex)` 。在调用 `use` 的过程中，Vue 会调用到 Vuex 的 `install` 函数

`install` 函数作用很简单

- 确保 Vuex 只安装一次
- 混入 `beforeCreate` 钩子函数，可以在组件中使用 `this.$store`

```js
export function install(_Vue) {
  // 确保 Vuex 只安装一次
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }
  Vue = _Vue
  applyMixin(Vue)
}

// applyMixin
export default function(Vue) {
  // 获得 Vue 版本号
  const version = Number(Vue.version.split('.')[0])
  // Vue 2.0 以上会混入 beforeCreate 函数
  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit })
  } else {
    // ...
  }
  // 作用很简单，就是能让我们在组件中
  // 使用到 this.$store
  function vuexInit() {
    const options = this.$options
    if (options.store) {
      this.$store =
        typeof options.store === 'function' ? options.store() : options.store
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store
    }
  }
}
```

### Vuex 初始化

##### `this._modules`

本小节内容主要解析如何初始化 `this._modules`

```js
export class Store {
  constructor (options = {}) {
    // 引入 Vue 的方式，自动安装
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }
    // 在开发环境中断言
    if (process.env.NODE_ENV !== 'production') {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      assert(this instanceof Store, `store must be called with the new operator.`)
    }
    // 获取 options 中的属性
    const {
      plugins = [],
      strict = false
    } = options

    // store 内部的状态，重点关注 this._modules
    this._committing = false
    this._actions = Object.create(null)
    this._actionSubscribers = []
    this._mutations = Object.create(null)
    this._wrappedGetters = Object.create(null)
    this._modules = new ModuleCollection(options)
    this._modulesNamespaceMap = Object.create(null)
    this._subscribers = []
    this._watcherVM = new Vue()


    const store = this
    const { dispatch, commit } = this
    // bind 以下两个函数上 this 上
    // 便于 this.$store.dispatch
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }
}
```

接下来看 `this._modules` 的过程，以 以下代码为例

```js
const moduleA = {
  state: { ... },
  mutations: { ... },
  actions: { ... },
  getters: { ... }
}

const moduleB = {
  state: { ... },
  mutations: { ... },
  actions: { ... }
}

const store = new Vuex.Store({
  state: { ... },
  modules: {
    a: moduleA,
    b: moduleB
  }
})
```

对于以上代码，`store` 可以看成 `root` 。在第一次执行时，会初始化一个 `rootModule`，然后判断 `root` 中是否存在 `modules` 属性，然后递归注册 `module` 。对于 child 来说，会获取到他所属的 `parent`, 然后在 `parent` 中添加 `module` 。

```js
export default class ModuleCollection {
  constructor (rawRootModule) {
    // register root module (Vuex.Store options)
    this.register([], rawRootModule, false)
  }
  register (path, rawModule, runtime = true) {
    // 开发环境断言
    if (process.env.NODE_ENV !== 'production') {
      assertRawModule(path, rawModule)
    }
    // 初始化 Module
    const newModule = new Module(rawModule, runtime)
    // 对于第一次初始化 ModuleCollection 时
    // 会走第一个 if 条件，因为当前是 root
    if (path.length === 0) {
      this.root = newModule
    } else {
      // 获取当前 Module 的 parent
      const parent = this.get(path.slice(0, -1))
      // 添加 child，第一个参数是
      // 当前 Module 的 key 值
      parent.addChild(path[path.length - 1], newModule)
    }

    // 递归注册
    if (rawModule.modules) {
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        this.register(path.concat(key), rawChildModule, runtime)
      })
    }
  }
}

export default class Module {
  constructor (rawModule, runtime) {
    this.runtime = runtime
    // 用于存储 children
    this._children = Object.create(null)
    // 用于存储原始的 rawModule
    this._rawModule = rawModule
    const rawState = rawModule.state

    // 用于存储 state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
  }
}
```

##### `installModule`

接下来看 `installModule` 的实现

```js
// installModule(this, state, [], this._modules.root)
function installModule(store, rootState, path, module, hot) {
  // 判断是否为 rootModule
  const isRoot = !path.length
  // 获取 namespace，root 没有 namespace
  // 对于 modules: {a: moduleA} 来说
  // namespace = 'a/'
  const namespace = store._modules.getNamespace(path)

  // 为 namespace 缓存 module
  if (module.namespaced) {
    store._modulesNamespaceMap[namespace] = module
  }

  // 设置 state
  if (!isRoot && !hot) {
    // 以下逻辑就是给 store.state 添加属性
    // 根据模块添加
    // state: { xxx: 1, a: {...}, b: {...} }
    const parentState = getNestedState(rootState, path.slice(0, -1))
    const moduleName = path[path.length - 1]
    store._withCommit(() => {
      Vue.set(parentState, moduleName, module.state)
    })
  }
  // 该方法其实是在重写 dispatch 和 commit 函数
  // 你是否有疑问模块中的 dispatch 和 commit
  // 是如何找到对应模块中的函数的
  // 假如模块 A 中有一个名为 add 的 mutation
  // 通过 makeLocalContext 函数，会将 add 变成
  // a/add，这样就可以找到模块 A 中对应函数了
  const local = (module.context = makeLocalContext(store, namespace, path))

  // 以下几个函数遍历，都是在
  // 注册模块中的 mutation、action 和 getter
  // 假如模块 A 中有名为 add 的 mutation 函数
  // 在注册过程中会变成 a/add
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key
    registerMutation(store, namespacedType, mutation, local)
  })

  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key
    const handler = action.handler || action
    registerAction(store, type, handler, local)
  })

  // 这里会生成一个 _wrappedGetters 属性
  // 用于缓存 getter，便于下次使用
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key
    registerGetter(store, namespacedType, getter, local)
  })

  // 递归安装模块
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}
```

##### `resetStoreVM`

接下来看 `resetStoreVM` 的实现，该属性实现了状态的响应式，并且将 `_wrappedGetters` 作为 `computed` 属性。

```js
// resetStoreVM(this, state)
function resetStoreVM(store, state, hot) {
  const oldVm = store._vm

  // 设置 getters 属性
  store.getters = {}
  const wrappedGetters = store._wrappedGetters
  const computed = {}
  // 遍历 _wrappedGetters 属性
  forEachValue(wrappedGetters, (fn, key) => {
    // 给 computed 对象添加属性
    computed[key] = () => fn(store)
    // 重写 get 方法
    // store.getters.xx 其实是访问了
    // store._vm[xx]
    // 也就是 computed 中的属性
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true, // for local getters
    })
  })

  // 使用 Vue 来保存 state 树
  // 同时也让 state 变成响应式
  const silent = Vue.config.silent
  Vue.config.silent = true
  // 当访问 store.state 时
  // 其实是访问了 store._vm._data.$$state
  store._vm = new Vue({
    data: {
      $$state: state,
    },
    computed,
  })
  Vue.config.silent = silent

  // 确保只能通过 commit 的方式改变状态
  if (store.strict) {
    enableStrictMode(store)
  }
}
```

### 常用 API

##### commit 解析

如果需要改变状态的话，一般都会使用 `commit` 去操作，接下来让我们来看看 `commit` 是如何实现状态的改变的

```js
commit(_type, _payload, _options) {
  // 检查传入的参数
  const { type, payload, options } = unifyObjectStyle(
    _type,
    _payload,
    _options
  )

  const mutation = { type, payload }
  // 找到对应的 mutation 函数
  const entry = this._mutations[type]
  // 判断是否找到
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] unknown mutation type: ${type}`)
    }
    return
  }
  // _withCommit 函数将 _committing
  // 设置为 TRUE，保证在 strict 模式下
  // 只能 commit 改变状态
  this._withCommit(() => {
    entry.forEach(function commitIterator(handler) {
      // entry.push(function wrappedMutationHandler(payload) {
      //   handler.call(store, local.state, payload)
      // })
      // handle 就是 wrappedMutationHandler 函数
      // wrappedMutationHandler 内部就是调用
      // 对于的 mutation 函数
      handler(payload)
    })
  })
  // 执行订阅函数
  this._subscribers.forEach(sub => sub(mutation, this.state))
}
```

##### dispatch 解析

如果需要异步改变状态，就需要通过 dispatch 的方式去实现。在 dispatch 调用的 `commit` 函数都是重写过的，会找到模块内的 mutation 函数。

```js
dispatch(_type, _payload) {
  // 检查传入的参数
  const { type, payload } = unifyObjectStyle(_type, _payload)

  const action = { type, payload }
  // 找到对于的 action 函数
  const entry = this._actions[type]
  // 判断是否找到
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] unknown action type: ${type}`)
    }
    return
  }
  // 触发订阅函数
  this._actionSubscribers.forEach(sub => sub(action, this.state))

  // 在注册 action 的时候，会将函数返回值
  // 处理成 promise，当 promise 全部
  // resolve 后，就会执行 Promise.all
  // 里的函数
  return entry.length > 1
    ? Promise.all(entry.map(handler => handler(payload)))
    : entry[0](payload)
}
```

##### 各种语法糖

在组件中，如果想正常使用 Vuex 的功能，经常需要这样调用 `this.$store.state.xxx` 的方式，引来了很多的不便。为此，Vuex 引入了语法糖的功能，让我们可以通过简单的方式来实现上述的功能。以下以 `mapState` 为例，其他的几个 map 都是差不多的原理，就不一一解析了。

```js
function normalizeNamespace(fn) {
  return (namespace, map) => {
    // 函数作用很简单
    // 根据参数生成 namespace
    if (typeof namespace !== 'string') {
      map = namespace
      namespace = ''
    } else if (namespace.charAt(namespace.length - 1) !== '/') {
      namespace += '/'
    }
    return fn(namespace, map)
  }
}
// 执行 mapState 就是执行
// normalizeNamespace 返回的函数
export const mapState = normalizeNamespace((namespace, states) => {
  const res = {}
  // normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
  // normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
  // function normalizeMap(map) {
  //   return Array.isArray(map)
  //     ? map.map(key => ({ key, val: key }))
  //     : Object.keys(map).map(key => ({ key, val: map[key] }))
  // }
  // states 参数可以参入数组或者对象类型
  normalizeMap(states).forEach(({ key, val }) => {
    res[key] = function mappedState() {
      let state = this.$store.state
      let getters = this.$store.getters
      if (namespace) {
        // 获得对应的模块
        const module = getModuleByNamespace(this.$store, 'mapState', namespace)
        if (!module) {
          return
        }
        state = module.context.state
        getters = module.context.getters
      }
      // 返回 State
      return typeof val === 'function'
        ? val.call(this, state, getters)
        : state[val]
    }
    // mark vuex getter for devtools
    res[key].vuex = true
  })
  return res
})
```
