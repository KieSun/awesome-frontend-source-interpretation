## 前言

在进入正题前，我们首先来看一下在项目中是如何使用 Redux 的，根据使用步骤来讲解源码。以 [我开源的 React 项目](https://user-gold-cdn.xitu.io/2018/1/8/160d38cb384a0ff0) 为例。

```js
// 首先把多个 reducer 通过 combineReducers 组合在一起
const appReducer = combineReducers({
	user: UserReducer,
	goods: GoodsReducer,
	order: OrdersReducer,
	chat: ChatReducer
});
// 然后将 appReducer 传入 createStore，并且通过 applyMiddleware 使用了中间件 thunkMiddleware
// replaceReducer 实现热更新替换
// 然后在需要的地方发起 dispatch(action) 引起 state 改变
export default function configureStore() {
	const store = createStore(
		rootReducer,
		compose(
			applyMiddleware(thunkMiddleware),
			window.devToolsExtension ? window.devToolsExtension() : f => f
		)
	);

	if (module.hot) {
		module.hot.accept("../reducers", () => {
			const nextRootReducer = require("../reducers/index");
			store.replaceReducer(nextRootReducer);
		});
	}

	return store;
}
```
介绍完了使用步骤，接下来进入正题。

## 源码解析

首先让我们来看下 `combineReducers` 函数
```js
// 传入一个 object
export default function combineReducers(reducers) {
 // 获取该 Object 的 key 值
	const reducerKeys = Object.keys(reducers)
	// 过滤后的 reducers
	const finalReducers = {}
	// 获取每一个 key 对应的 value
	// 在开发环境下判断值是否为 undefined
	// 然后将值类型是函数的值放入 finalReducers
	for (let i = 0; i < reducerKeys.length; i++) {
		const key = reducerKeys[i]

		if (process.env.NODE_ENV !== 'production') {
			if (typeof reducers[key] === 'undefined') {
				warning(`No reducer provided for key "${key}"`)
			}
		}

		if (typeof reducers[key] === 'function') {
			finalReducers[key] = reducers[key]
		}
	}
	// 拿到过滤后的 reducers 的 key 值
	const finalReducerKeys = Object.keys(finalReducers)
	
	// 在开发环境下判断，保存不期望 key 的缓存用以下面做警告  
	let unexpectedKeyCache
	if (process.env.NODE_ENV !== 'production') {
		unexpectedKeyCache = {}
	}
		
	let shapeAssertionError
	try {
	// 该函数解析在下面
		assertReducerShape(finalReducers)
	} catch (e) {
		shapeAssertionError = e
	}
// combineReducers 函数返回一个函数，也就是合并后的 reducer 函数
// 该函数返回总的 state
// 并且你也可以发现这里使用了闭包，函数里面使用到了外面的一些属性
	return function combination(state = {}, action) {
		if (shapeAssertionError) {
			throw shapeAssertionError
		}
		// 该函数解析在下面
		if (process.env.NODE_ENV !== 'production') {
			const warningMessage = getUnexpectedStateShapeWarningMessage(
				state,
				finalReducers,
				action,
				unexpectedKeyCache
			)
			if (warningMessage) {
				warning(warningMessage)
			}
		}
		// state 是否改变
		let hasChanged = false
		// 改变后的 state
		const nextState = {}
		for (let i = 0; i < finalReducerKeys.length; i++) {
		// 拿到相应的 key
			const key = finalReducerKeys[i]
			// 获得 key 对应的 reducer 函数
			const reducer = finalReducers[key]
			// state 树下的 key 是与 finalReducers 下的 key 相同的
			// 所以你在 combineReducers 中传入的参数的 key 即代表了 各个 reducer 也代表了各个 state
			const previousStateForKey = state[key]
			// 然后执行 reducer 函数获得该 key 值对应的 state
			const nextStateForKey = reducer(previousStateForKey, action)
			// 判断 state 的值，undefined 的话就报错
			if (typeof nextStateForKey === 'undefined') {
				const errorMessage = getUndefinedStateErrorMessage(key, action)
				throw new Error(errorMessage)
			}
			// 然后将 value 塞进去
			nextState[key] = nextStateForKey
			// 如果 state 改变
			hasChanged = hasChanged || nextStateForKey !== previousStateForKey
		}
		// state 只要改变过，就返回新的 state
		return hasChanged ? nextState : state
	}
}
```

`combineReducers` 函数总的来说很简单，总结来说就是接收一个对象，将参数过滤后返回一个函数。该函数里有一个过滤参数后的对象 finalReducers，遍历该对象，然后执行对象中的每一个 reducer 函数，最后将新的 state 返回。

接下来让我们来看看 combinrReducers 中用到的两个函数

```js
// 这是执行的第一个用于抛错的函数
function assertReducerShape(reducers) {
// 将 combineReducers 中的参数遍历
	Object.keys(reducers).forEach(key => {
		const reducer = reducers[key]
		// 给他传入一个 action
		const initialState = reducer(undefined, { type: ActionTypes.INIT })
		// 如果得到的 state 为 undefined 就抛错
		if (typeof initialState === 'undefined') {
			throw new Error(
				`Reducer "${key}" returned undefined during initialization. ` +
					`If the state passed to the reducer is undefined, you must ` +
					`explicitly return the initial state. The initial state may ` +
					`not be undefined. If you don't want to set a value for this reducer, ` +
					`you can use null instead of undefined.`
			)
		}
		// 再过滤一次，考虑到万一你在 reducer 中给 ActionTypes.INIT 返回了值
		// 传入一个随机的 action 判断值是否为 undefined
		const type =
			'@@redux/PROBE_UNKNOWN_ACTION_' +
			Math.random()
				.toString(36)
				.substring(7)
				.split('')
				.join('.')
		if (typeof reducer(undefined, { type }) === 'undefined') {
			throw new Error(
				`Reducer "${key}" returned undefined when probed with a random type. ` +
					`Don't try to handle ${
						ActionTypes.INIT
					} or other actions in "redux/*" ` +
					`namespace. They are considered private. Instead, you must return the ` +
					`current state for any unknown actions, unless it is undefined, ` +
					`in which case you must return the initial state, regardless of the ` +
					`action type. The initial state may not be undefined, but can be null.`
			)
		}
	})
}

function getUnexpectedStateShapeWarningMessage(
	inputState,
	reducers,
	action,
	unexpectedKeyCache
) {
	// 这里的 reducers 已经是 finalReducers
	const reducerKeys = Object.keys(reducers)
	const argumentName =
		action && action.type === ActionTypes.INIT
			? 'preloadedState argument passed to createStore'
			: 'previous state received by the reducer'
	
	// 如果 finalReducers 为空
	if (reducerKeys.length === 0) {
		return (
			'Store does not have a valid reducer. Make sure the argument passed ' +
			'to combineReducers is an object whose values are reducers.'
		)
	}
		// 如果你传入的 state 不是对象
	if (!isPlainObject(inputState)) {
		return (
			`The ${argumentName} has unexpected type of "` +
			{}.toString.call(inputState).match(/\s([a-z|A-Z]+)/)[1] +
			`". Expected argument to be an object with the following ` +
			`keys: "${reducerKeys.join('", "')}"`
		)
	}
		// 将参入的 state 于 finalReducers 下的 key 做比较，过滤出多余的 key
	const unexpectedKeys = Object.keys(inputState).filter(
		key => !reducers.hasOwnProperty(key) && !unexpectedKeyCache[key]
	)

	unexpectedKeys.forEach(key => {
		unexpectedKeyCache[key] = true
	})

	if (action && action.type === ActionTypes.REPLACE) return

// 如果 unexpectedKeys 有值的话
	if (unexpectedKeys.length > 0) {
		return (
			`Unexpected ${unexpectedKeys.length > 1 ? 'keys' : 'key'} ` +
			`"${unexpectedKeys.join('", "')}" found in ${argumentName}. ` +
			`Expected to find one of the known reducer keys instead: ` +
			`"${reducerKeys.join('", "')}". Unexpected keys will be ignored.`
		)
	}
}
```

接下来让我们先来看看 `compose` 函数

```js
// 这个函数设计的很巧妙，通过传入函数引用的方式让我们完成多个函数的嵌套使用，术语叫做高阶函数
// 通过使用 reduce 函数做到从右至左调用函数
// 对于上面项目中的例子
compose(
		applyMiddleware(thunkMiddleware),
		window.devToolsExtension ? window.devToolsExtension() : f => f
) 
// 经过 compose 函数变成了 applyMiddleware(thunkMiddleware)(window.devToolsExtension()())
// 所以在找不到 window.devToolsExtension 时你应该返回一个函数
export default function compose(...funcs) {
	if (funcs.length === 0) {
		return arg => arg
	}

	if (funcs.length === 1) {
		return funcs[0]
	}

	return funcs.reduce((a, b) => (...args) => a(b(...args)))
}
```

然后我们来解析 `createStore` 函数的部分代码

```js
export default function createStore(reducer, preloadedState, enhancer) {
	// 一般 preloadedState 用的少，判断类型，如果第二个参数是函数且没有第三个参数，就调换位置
	if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
		enhancer = preloadedState
		preloadedState = undefined
	}
	// 判断 enhancer 是否是函数
	if (typeof enhancer !== 'undefined') {
		if (typeof enhancer !== 'function') {
			throw new Error('Expected the enhancer to be a function.')
		}
		// 类型没错的话，先执行 enhancer，然后再执行 createStore 函数
		return enhancer(createStore)(reducer, preloadedState)
	}
	// 判断 reducer 是否是函数
	if (typeof reducer !== 'function') {
		throw new Error('Expected the reducer to be a function.')
	}
	// 当前 reducer
	let currentReducer = reducer
	// 当前状态
	let currentState = preloadedState
	// 当前监听函数数组
	let currentListeners = []
	// 这是一个很重要的设计，为的就是每次在遍历监听器的时候保证 currentListeners 数组不变
	// 可以考虑下只存在 currentListeners 的情况，如果我在某个 subscribe 中再次执行 subscribe
	// 或者 unsubscribe，这样会导致当前的 currentListeners 数组大小发生改变，从而可能导致
	// 索引出错
	let nextListeners = currentListeners
	// reducer 是否正在执行
	let isDispatching = false
	// 如果 currentListeners 和 nextListeners 相同，就赋值回去
	function ensureCanMutateNextListeners() {
		if (nextListeners === currentListeners) {
			nextListeners = currentListeners.slice()
		}
	}
	// ......
}
```

接下来先来介绍 `applyMiddleware` 函数

在这之前我需要先来介绍一下函数柯里化，柯里化是一种将使用多个参数的一个函数转换成一系列使用一个参数的函数的技术。

```js
function add(a,b) { return a + b }   
add(1, 2) => 3
// 对于以上函数如果使用柯里化可以这样改造
function add(a) {
		return b => {
				return a + b
		}
}
add(1)(2) => 3
// 你可以这样理解函数柯里化，通过闭包保存了外部的一个变量，然后返回一个接收参数的函数，在该函数中使用了保存的变量，然后再返回值。
```

```js
// 这个函数应该是整个源码中最难理解的一块了
// 该函数返回一个柯里化的函数
// 所以调用这个函数应该这样写 applyMiddleware(...middlewares)(createStore)(...args)
export default function applyMiddleware(...middlewares) {
	return createStore => (...args) => {
	 // 这里执行 createStore 函数，把 applyMiddleware 函数最后次调用的参数传进来
		const store = createStore(...args)
		let dispatch = () => {
			throw new Error(
				`Dispatching while constructing your middleware is not allowed. ` +
					`Other middleware would not be applied to this dispatch.`
			)
		}
		let chain = []
		// 每个中间件都应该有这两个函数
		const middlewareAPI = {
			getState: store.getState,
			dispatch: (...args) => dispatch(...args)
		}
		// 把 middlewares 中的每个中间件都传入 middlewareAPI
		chain = middlewares.map(middleware => middleware(middlewareAPI))
		// 和之前一样，从右至左调用每个中间件，然后传入 store.dispatch
		dispatch = compose(...chain)(store.dispatch)
		// 这里只看这部分代码有点抽象，我这里放入 redux-thunk 的代码来结合分析
		// createThunkMiddleware返回了3层函数，第一层函数接收 middlewareAPI 参数
		// 第二次函数接收 store.dispatch
		// 第三层函数接收 dispatch 中的参数
{function createThunkMiddleware(extraArgument) {
	return ({ dispatch, getState }) => next => action => {
	// 判断 dispatch 中的参数是否为函数
		if (typeof action === 'function') {
		// 是函数的话再把这些参数传进去，直到 action 不为函数，执行 dispatch({tyep: 'XXX'})
			return action(dispatch, getState, extraArgument);
		}

		return next(action);
	};
}
const thunk = createThunkMiddleware();

export default thunk;}
// 最后把经过中间件加强后的 dispatch 于剩余 store 中的属性返回，这样你的 dispatch
		return {
			...store,
			dispatch
		}
	}
}
```

好了，我们现在将困难的部分都攻克了，来看一些简单的代码

```js 
// 这个没啥好说的，就是把当前的 state 返回，但是当正在执行 reducer 时不能执行该方法
function getState() {
		if (isDispatching) {
			throw new Error(
				'You may not call store.getState() while the reducer is executing. ' +
					'The reducer has already received the state as an argument. ' +
					'Pass it down from the top reducer instead of reading it from the store.'
			)
		}

		return currentState
}
// 接收一个函数参数
function subscribe(listener) {
		if (typeof listener !== 'function') {
			throw new Error('Expected listener to be a function.')
		}
// 这部分最主要的设计 nextListeners 已经讲过，其他基本没什么好说的
		if (isDispatching) {
			throw new Error(
				'You may not call store.subscribe() while the reducer is executing. ' +
					'If you would like to be notified after the store has been updated, subscribe from a ' +
					'component and invoke store.getState() in the callback to access the latest state. ' +
					'See http://redux.js.org/docs/api/Store.html#subscribe for more details.'
			)
		}

		let isSubscribed = true

		ensureCanMutateNextListeners()
		nextListeners.push(listener)

// 返回一个取消订阅函数
		return function unsubscribe() {
			if (!isSubscribed) {
				return
			}

			if (isDispatching) {
				throw new Error(
					'You may not unsubscribe from a store listener while the reducer is executing. ' +
						'See http://redux.js.org/docs/api/Store.html#subscribe for more details.'
				)
			}

			isSubscribed = false

			ensureCanMutateNextListeners()
			const index = nextListeners.indexOf(listener)
			nextListeners.splice(index, 1)
		}
	}
 
function dispatch(action) {
// 原生的 dispatch 会判断 action 是否为对象
		if (!isPlainObject(action)) {
			throw new Error(
				'Actions must be plain objects. ' +
					'Use custom middleware for async actions.'
			)
		}

		if (typeof action.type === 'undefined') {
			throw new Error(
				'Actions may not have an undefined "type" property. ' +
					'Have you misspelled a constant?'
			)
		}
// 注意在 Reducers 中是不能执行 dispatch 函数的
// 因为你一旦在 reducer 函数中执行 dispatch，会引发死循环
		if (isDispatching) {
			throw new Error('Reducers may not dispatch actions.')
		}
// 执行 combineReducers 组合后的函数
		try {
			isDispatching = true
			currentState = currentReducer(currentState, action)
		} finally {
			isDispatching = false
		}
// 然后遍历 currentListeners，执行数组中保存的函数
		const listeners = (currentListeners = nextListeners)
		for (let i = 0; i < listeners.length; i++) {
			const listener = listeners[i]
			listener()
		}

		return action
	}
 // 然后在 createStore 末尾会发起一个 action dispatch({ type: ActionTypes.INIT });
 // 用以初始化 state
```