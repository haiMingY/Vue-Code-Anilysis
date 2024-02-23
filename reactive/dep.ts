import type { ReactiveEffect } from './effect'
import type { ComputedRefImpl } from './computed'

/**
 * 在Vue 3响应式系统中，`Dep` 类型和 `createDep` 函数是用于实现依赖收集和管理的核心部分。

**Dep类型定义：**
```typescript
export type Dep = Map<ReactiveEffect, number> & {
  cleanup: () => void
  computed?: ComputedRefImpl<any>
}
```
- `Map<ReactiveEffect, number>`：表示一个存储了副作用（如计算属性、watcher等）与它们的触发顺序或权重的关系映射表。当响应式数据发生变化时，会遍历这个Map来通知所有依赖于该数据变化的副作用函数执行。
- `cleanup: () => void`：这是一个清理方法，当依赖项不再需要被跟踪或者相关组件卸载时，调用此方法来释放资源。
- `computed?: ComputedRefImpl<any>`：可选属性，如果这个Dep是由计算属性创建的，则保存计算属性的实现细节，以便在特定场景下进行特殊处理。

**createDep函数：**
```typescript
export const createDep = (
  cleanup: () => void,
  computed?: ComputedRefImpl<any>,
): Dep => {
  const dep = new Map() as Dep
  dep.cleanup = cleanup
  dep.computed = computed
  return dep
}
```
这个函数用于创建一个新的`Dep`实例。它接收两个参数：
1. `cleanup`：传入一个清理函数，赋值给新创建的`Dep`实例上的`cleanup`属性。
2. `computed`（可选）：如果当前`Dep`由计算属性创建，传入计算属性的内部实现（`ComputedRefImpl<any>`），赋值给新创建的`Dep`实例上的`computed`属性。

最后，返回创建好的具有上述属性的`Dep`实例，这个实例将用于追踪和调度响应式对象的所有依赖关系。
 */
/**
 * Dep类型定义:
 * 它是一个联合类型，表示一个 Map 结构，其中键是 ReactiveEffect 对象，值为ReactiveEffect 对象的_trackId属性值，并且扩展了一些额外属性。
 * 
 */
export type Dep = Map<ReactiveEffect, number> & {
  /**
   * cleanup 这是一个清理方法，当依赖关系不再需要时执行
   * @example
   * ```javascript
   *  depsMap.set(key, (dep = createDep(() => depsMap!.delete(key))))
   * ```
   * 在track函数中,就是定义cleanup函数来从depsMap中将当前key删除掉
   * @returns 
   */
  cleanup: () => void
  /**
   * 可选的计算属性实例(ComputedRefImpl对象)，如果该 Dep 是由计算属性产生的，则会指向对应的计算属性实例
   */
  computed?: ComputedRefImpl<any>
}
/**
 * createDep 用于创建一个Dep
 * @param cleanup 清理函数，在不需要这个 Dep 时调用以释放资源
 * @param computed 计算属性实例(ComputedRefImpl对象)，将它与新建的 Dep 关联起来
 * @returns 
 */
export const createDep = (
  cleanup: () => void,
  computed?: ComputedRefImpl<any>,
): Dep => {
  const dep = new Map() as Dep
  dep.cleanup = cleanup
  dep.computed = computed
  return dep
}
