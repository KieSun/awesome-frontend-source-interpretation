Fiber 其实有多种含义，第一种肯定就是说架构了；第二种是数据结构，用来表示节点的一些数据以及其它内容；第三种是指工作单元，用于调度器干活时判断中断还是继续。

Fiber 架构参考了代数作用，或者说目前 React 很多新的内容都是参考了这个，比如说 hooks、Supend。这个代数作用简单来说就是排除副作用，分离开要做啥以及怎么做。类似 `try catch`，内部 `throw` 一个错误出去，外部 `catch` 住，但是仅仅这样还不够，当外部知道怎么做以后，还得回到代码做什么的地方，这边又有点类似 `generater` 了。其实 Fiber 一部分内容是和 `generater` 相似的，但是 `generater` 是存在副作用的，并且也没有优先级的概念，所以 React 并没有采用这个 API 来实现 Fiber，github 上也有相关的这个 issue 讨论。

另外 fiber 中还有一些大家耳熟能详的技术点，比如双缓存树。

React 工作中最多存在两颗 Fiber 树，一颗为 `current`，一颗为 `workInProgress`。

刚 `mount` 时 fiberRoot 的 `current` 指向 rootFiber，前者只有一个，后者可以多个。

rootFiber 会创建 `alternate` 也就是缓存树，然后在这个树上进行创建节点等等操作，最后渲染的时候将 fiberRoot 的 current 指向当前操作的树。

再次触发更新时，rootFiber 存在 `alternate`，此时复用 `alternate` 并在之上操作，但此时除了 rootFiber 之外，其他的子节点还是不存在 alternate，因此需要创建。此时渲染后，每个节点都存在了 `alternate`，双缓存树此时才算构建完成

第二次触发更新时，因为每个节点的 `alternate` 都已存在，此时只需复用树即可。

双缓存树可以实现任务的打断，反正都是在内存里操作节点，并且复用对象可以防止频繁的 GC。