## React 源码解析

距离笔者更新 React 原理解析也过去两三年了，近期准备把这个坑全部填上。

之前的做法是给源码注释，然后辅以文章的形式，你可以切换分支至 **old-interpretation**。但实际上对于大部分开发者而言根本没必须要阅读源码，学习原理知识就已经足够了。React 更新了那么多版本，虽然内部的代码变了不少，但是核心的原理是压根没多大变化的，无非概念有一些转变，所以说花费大量时间阅读源码性价比其实并不高。

因此笔者这次打算尽可能地少聊源码，通过文字、测试用例、图片的方式辅以部分最小代码实现来为大家解释 React 的原理。当然如果还是有读者想自己读读源码，笔者也会提供具体的代码位置方便大家阅读。

## 新版文章链接

### 前言

### 读源码前的准备及注意事项

### 架构层面

### 组件 mount 及 update

### 调度相关

### Hooks

### 事件

### 异步渲染
## 旧版文章链接

- [热身篇](https://github.com/KieSun/learn-react-essence/blob/master/%E7%83%AD%E8%BA%AB%E7%AF%87.md)
- [render 流程（一）](https://github.com/KieSun/learn-react-essence/blob/master/render%20%E6%B5%81%E7%A8%8B%EF%BC%88%E4%B8%80%EF%BC%89.md)
- [render 流程（二）](https://github.com/KieSun/learn-react-essence/blob/master/render%20%E6%B5%81%E7%A8%8B%EF%BC%88%E4%BA%8C%EF%BC%89.md)
- [调度原理](https://github.com/KieSun/learn-react-essence/blob/master/%E8%B0%83%E5%BA%A6%E5%8E%9F%E7%90%86.md)
- [组件更新流程（一）](https://github.com/KieSun/learn-react-essence/blob/master/%E7%BB%84%E4%BB%B6%E6%9B%B4%E6%96%B0%E6%B5%81%E7%A8%8B%E4%B8%80%EF%BC%88%E8%B0%83%E5%BA%A6%E4%BB%BB%E5%8A%A1%EF%BC%89.md)
- [组件更新流程（二）](https://github.com/KieSun/learn-react-essence/blob/master/%E7%BB%84%E4%BB%B6%E6%9B%B4%E6%96%B0%E6%B5%81%E7%A8%8B%E4%BA%8C%EF%BC%88diff%20%E7%AD%96%E7%95%A5%EF%BC%89.md)
