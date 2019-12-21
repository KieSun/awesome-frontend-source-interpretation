## React 源码解析

| 微信扫码关注公众号，订阅更多精彩内容                                                                 | 加笔者微信进群与大厂大佬讨论技术                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| <img src="https://yck-1254263422.cos.ap-shanghai.myqcloud.com/20191220223702.jpeg" width="500px;" /> | <img src="https://yck-1254263422.cos.ap-shanghai.myqcloud.com/20191220224224.png" width="260px;" /> |

这是一份 Fork 的 React 代码，版本为 16.8.6。

笔者会对这份代码做一个详细的核心源码解析。通过两个部分来完成这个解析：第一是加上这份代码的中文注释，第二是配套相应的文章。

你可以通过阅读我的 Commit 信息来了解到我是如何阅读这份代码的。

PS：不会对任何 DEV 环境下的代码做解读，类似以下代码：

```js
if (__DEV__) {
	// ...
}
```

Github 的阅读体验稍显逊色，你可以选择在[我的网站](https://yuchengkai.cn/react/)上阅读。

## 文章链接

需要注意一点：文章的风格分为了两部分。 从调度原理开始，笔者抛弃了单纯讲源码的方式。而是将重点放在了原理上，尽可能地脱离源码讲原理，这种方式能更快更好地让读者学习到知识。

- [热身篇](https://github.com/KieSun/learn-react-essence/blob/master/%E7%83%AD%E8%BA%AB%E7%AF%87.md)
- [render 流程（一）](https://github.com/KieSun/learn-react-essence/blob/master/render%20%E6%B5%81%E7%A8%8B%EF%BC%88%E4%B8%80%EF%BC%89)
- [render 流程（二）](https://github.com/KieSun/learn-react-essence/blob/master/render%20%E6%B5%81%E7%A8%8B%EF%BC%88%E4%BA%8C%EF%BC%89)
- [调度原理](https://github.com/KieSun/learn-react-essence/blob/master/%E8%B0%83%E5%BA%A6%E5%8E%9F%E7%90%86.md)
- [组件更新流程（一）](https://github.com/KieSun/learn-react-essence/blob/master/%E7%BB%84%E4%BB%B6%E6%9B%B4%E6%96%B0%E6%B5%81%E7%A8%8B%EF%BC%88%E4%B8%80%EF%BC%89.md)
