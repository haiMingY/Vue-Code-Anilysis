import type { ReactiveEffect } from './effect'
import { warn } from './warning'

// 全局变量，它在 Vue3 的响应式系统中用于跟踪当前活动的效果作用域（EffectScope）。
// 在执行某个副作用函数（effect）时，Vue 会将当前正在运行的 EffectScope 设置为全局的 activeEffectScope
let activeEffectScope: EffectScope | undefined
/**
 * EffectScope 类是 Vue3 响应式系统中管理一组相关 effect（副作用函数）的作用域。
 * 它主要负责收集和控制这些 effect 的执行、清理以及在作用域结束时自动停止所有关联的 effect。
 */
export class EffectScope {
  /**
   * @internal
   * 表示该作用域是否处于活动状态，
   */
  private _active = true
  /**
   * @internal
   * 存储当前作用域下所有的 ReactiveEffect 实例
   */
  effects: ReactiveEffect[] = []
  /**
   * @internal
   * 存储当作用域结束时需要执行的清理函数
   */
  cleanups: (() => void)[] = []

  /**
   * only assigned by undetached scope
   * 用于构建效果作用域层级关系，当创建一个新的非独立作用域时，它的 parent 属性会被设置为其父级作用域实例
   * @internal
   */
  parent: EffectScope | undefined
  /**
   * record undetached scopes
   * 记录非独立的的子作用域列表
   * @internal
   */
  scopes: EffectScope[] | undefined
  /**
   * track a child scope's index in its parent's scopes array for optimized
   * removal
   * 该属性记录了当前作用域在其父级作用域的子作用域列表（scopes 数组）中的索引位置。同样，只有在创建非独立作用域时，
   * Vue 会将新创建的作用域添加到其父级作用域的子作用域列表，并为此新创建的作用域设置正确的索引值
   * @internal
   */
  private index: number | undefined

  /**
   * 
   * @param detached 参数 detached，默认为 false，表示此作用域是否独立于父级作用域。如果不是独立作用域，则会将自身添加到父级作用域的 scopes 列表中，并设置其索引值。
   */
  constructor(public detached = false) {
    // 将当前全局变量保存的EffectScope实例设置为其parent属性
    this.parent = activeEffectScope
    if (!detached && activeEffectScope) {
      // 非独立和存在activeEffectScope时，将当前新创建的EffectScope添加到父作用域的scopes属性中
      this.index =
        (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this,
        ) - 1
    }
  }
  // 获取当前作用域状态
  get active() {
    return this._active
  }
/**
 * 
 * @param fn 一个需要执行的函数
 * @returns 
 */
  run<T>(fn: () => T): T | undefined {
    // 如果当前作用域为活跃状态
    if (this._active) {
      // 使用变量currentEffectScope保存全局activeEffectScope的值
      const currentEffectScope = activeEffectScope
      try {
        // 使全局activeEffectScope指向当前的EffectScope实例
        activeEffectScope = this
        // 执行fn函数
        return fn()
      } finally {
        // 重新将全局activeEffectScope值重置为fn运行之前的值currentEffectScope 
        activeEffectScope = currentEffectScope
      }
    } else if (__DEV__) {
      warn(`cannot run an inactive effect scope.`)
    }
  }

  /**
   * This should only be called on non-detached scopes
   * 仅能被非独立作用域调用，使全局变量activeEffectScope 指向当前EffectScope实例对象
   * @internal
   */
  on() {
    activeEffectScope = this
  }

  /**
   * This should only be called on non-detached scopes
   * 仅能被非独立作用域调用，使全局变量activeEffectScope 指向当前EffectScope实例的父作用域
   * @internal
   */
  off() {
    activeEffectScope = this.parent
  }
/**
 * 停止当前作用域及其所有子作用域，并执行所有清理函数
 * @param fromParent 是不是来自父作用域清理调用
 */
  stop(fromParent?: boolean) {
    // 如果当前effectScope实例是活跃的，即还没有被stop过，才执行清理操作
    if (this._active) {
      let i, l
      // 停止所有effect
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop()
      }
      // 执行所有cleanup函数，这些函数通常用于释放资源或执行其他必要的清理任务。
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]()
      }
      // 停止并清理所有嵌套的作用域
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true)
        }
      }
      // nested scope, dereference from parent to avoid memory 
      // 当嵌套的作用域不再需要时，应该从其父作用域中解除对它的引用，以避免内存泄漏。
      // 非独立作用域且存在其父作用域而且fromParent为false
      if (!this.detached && this.parent && !fromParent) {
        // optimized O(1) removal
        // 移除作用域数组中的最后一个scope(虽然会改变原数组的length,但不会改变其他元素的索引位置)
        const last = this.parent.scopes!.pop()
        if (last && last !== this) { // 如过last不为undefined，且不是当的这个作用域(如果是当前的这个就没必要执行下面的操作了，因为就已经移除了)
          // 将last替换到当前作用域在scopes数组的位置
          this.parent.scopes![this.index!] = last
          // 将last的索引更改为当前scope的索引位置，删除完毕
          last.index = this.index!
        }
      }
      this.parent = undefined
      // 表明该作用域已经停止活跃
      this._active = false
    }
  }
}

/**
 * Creates an effect scope object which can capture the reactive effects (i.e.
 * computed and watchers) created within it so that these effects can be
 * disposed together. For detailed use cases of this API, please consult its
 * corresponding {@link https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md | RFC}.
 * 用于创建一个新的EffectScope实例。这个作用域可以捕获在其内部创建的所有响应式effects(例如computed和watchers），
 * 从而可以一次性地一起处理（例如停止或清理）这些effect。
 * @param detached - 当 detached 为 true 时，创建的效果作用域将不会自动附加到当前的活动作用域(activeEffectScope)上，而是保持独立。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#effectscope}
 */
export function effectScope(detached?: boolean) {
  return new EffectScope(detached)
}
/**
 * 这个函数用于将一个ReactiveEffect对象记录到一个给定的EffectScope对象中。
 * @param effect 一个ReactiveEffect实例
 * @param scope 一个EffectScope实例，如果未提供，默认为activeEffectScope的值
 */
export function recordEffectScope(
  effect: ReactiveEffect,
  scope: EffectScope | undefined = activeEffectScope,
) {
  // 如果scope值不为undefined且scope是活跃的
  if (scope && scope.active) {
    // 将effect对象添加到scope的effects数组中
    scope.effects.push(effect)
  }
}

/**
 * Returns the current active effect scope if there is one.
 * 获取当前活跃的effect scope
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#getcurrentscope}
 */
export function getCurrentScope() {
  return activeEffectScope
}

/**
 * Registers a dispose callback on the current active effect scope. The
 * callback will be invoked when the associated effect scope is stopped.
 * 用于在当前活动EffectScope对象上注册一个清理回调函数（fn）。
 * 当这个EffectScope对象被停止时，这个回调函数会被调用。
 * @param fn - The callback function to attach to the scope's cleanup.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#onscopedispose}
 */
export function onScopeDispose(fn: () => void) {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn)
  } else if (__DEV__) { // 如果在调用时activeEffectScope为undefined则在开发环境发出警告
    warn(
      `onScopeDispose() is called when there is no active effect scope` +
        ` to be associated with.`,
    )
  }
}
