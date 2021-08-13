# 如何调试 React 源码

接下来笔者会介绍下我们该如何调试 React 源码，并且这个方式适用于几乎所有的三方库。

第一次肯定是 clone 仓库了，我们打开 [React 仓库](https://github.com/facebook/react)在本地执行 `git clone`。

```shell
# 克隆仓库
git clone https://github.com/facebook/react.git

# 进入目录并且安装依赖
cd react && yarn
```

因为不确认各位读者在阅读这篇文章的时候 React 处于什么版本，如果版本大于 17.0.1，大家可以通过执行以下命令切换版本至 17.0.1。

```shell
# 切换代码版本
git checkout v17.0.1
```

接下来我们需要构建代码，在 react 项目根目录执行 `yarn build`，当然这样构建会很慢，因为是全量构建，我们也可以通过传入一些参数来构建我们需要的内容。

```shell
yarn build react/index,react/jsx,react-dom/index,scheduler --type=NODE
```

除了上述参数之外，我们还可以传入别的参数，具体查看下图：

![n3yk0I](https://yck-1254263422.file.myqcloud.com/uPic/n3yk0I.png)

比如说我们可以传入 `--wathch` 实现修改代码后重新构建，这个功能还是挺实用的。

当我们构建完毕以后，应该可以在根目录下寻找到 `build` 目录，其中结构大致如图所示：

![CRYHAQ](https://yck-1254263422.file.myqcloud.com/uPic/CRYHAQ.png)

我们需要的内容都在 `node_modules` 里，接下来我们需要进入 `react` 及 `react-dom` 目录中将包 `link` 到全局。

```shell
# 进入 react 目录执行 yarn link
cd react && yarn link
# 进入 react-dom 目录执行 yarn link
cd ../react-dom && yarn link
```

执行完上述两步以后，这两个库就被我们 link 到全局了，接下来大家可以在任意 React 项目中执行以下命令即可：

```shell
yarn link react react-dom
```

执行完 link 以后，大家可以在构建出来的 react 或者 react-dom 代码中加入 `console.log(1)` ，并且运行 React 项目查看是否生效。

另外除了上述这种 link 手段之外，我们其实还有种方式能实现更好用的 link。

因为文中的这种方式在某些情况下会有些局限性。大家都知道 React 项目中如果存在两个 `react` 实例是会发生问题的。比如说我们现在需要调试一个 React 的组件库，那么在执行 link 以后，调试的主项目就会存在两个 `react` 实例。这时候如果你在使用 Hooks 的话就会直接报错了，因此对于公共依赖冲突的情况就可以使用接下来提到的 link 方式：[yalc](https://github.com/wclr/yalc)

这种方式大部分行为都和 npm link 一致，但是对于公共依赖而言，这种方式会从主项目的 node_modules 里面拿，其它的就从全局拿，这样就可以解决依赖冲突带来的问题了。

最后总结一下文章内容，对于大部分三方库我们都可以通过以下步骤进行源码调试：

1. clone 仓库、如有需要切换仓库、安装依赖
2. 寻找 build 命令并执行
3. 在构建好的代码目录下执行 `yarn link`
4. 在需要调试的项目中执行 `yarn link xxx`
5. 如果有公共依赖冲突，通过 [yalc](https://github.com/wclr/yalc) 解决
