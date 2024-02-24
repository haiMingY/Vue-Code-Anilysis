# Vue-Code-Anilysis(Vue3 源码解析)
## 项目概览

本仓库专注于对Vue3框架核心源代码进行深入细致的剖析，旨在揭示其全新的响应式系统、Composition API设计、优化策略以及组件化实现等高级特性。通过阅读和理解这些源码，开发者不仅能更上一层楼地掌握Vue3的工作原理，还能提升自己在实际开发中的性能优化与架构设计能力。

## 版本

版本为v3.4.16

### 主要内容

- **基于Proxy的响应式系统**：探讨Vue3如何使用ES6 Proxy替代Object.defineProperty，实现实时的数据绑定和依赖收集机制以及各个关键函数的源码分析。[详情](reactive/reactivity源码解析.md)

- **Watch和WatchEffect**：探讨区别以及源码分析 [详情](runtime-core/watch和watchEffect.md)

- **Vue Scheduler**: 探讨Vue3中的调度模块和异步更新策略，以及nextTick API  [详情](runtime-core/vue调度器(Scheduler).md)

  

## 资源链接

- **Vue3官方源码仓库**：[GitHub](https://github.com/vuejs/core)
- **Vue3官方文档**：[简介 | Vue.js (vuejs.org)](https://cn.vuejs.org/guide/introduction.html)

## 联系方式

如果您在阅读过程中遇到任何问题、想要分享见解或发现文档中的错误，欢迎在GitHub Issues页面创建议题，
