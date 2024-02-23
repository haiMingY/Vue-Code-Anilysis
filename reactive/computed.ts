import { type DebuggerOptions, ReactiveEffect } from './effect'
import { type Ref, trackRefValue, triggerRefValue } from './ref'
import { NOOP, hasChanged, isFunction } from '@vue/shared'
import { toRaw } from './reactive'
import type { Dep } from './dep'
import { DirtyLevels, ReactiveFlags } from './constants'

declare const ComputedRefSymbol: unique symbol

export interface ComputedRef<T = any> extends WritableComputedRef<T> {
  readonly value: T
  [ComputedRefSymbol]: true
}

export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect<T>
}

export type ComputedGetter<T> = (oldValue?: T) => T
export type ComputedSetter<T> = (newValue: T) => void

export interface WritableComputedOptions<T> {
  get: ComputedGetter<T>
  set: ComputedSetter<T>
}
/**
 * ComputedRefImpl类是 Vue.js 响应式系统中计算属性的内部实现。计算属性是基于它们依赖的响应式数据动态计算出来的值。
 * 这个类封装了计算属性的行为，包括它的值、依赖的追踪、以及当依赖变化时的更新。
 */
export class ComputedRefImpl<T> {
  // 存储当前计算属性关联的依赖收集器Dep
  public dep?: Dep = undefined
  // 存储计算属性的最新值
  private _value!: T
  //  ReactiveEffect对象，表示执行计算逻辑并处理依赖关系的副作用函数
  public readonly effect: ReactiveEffect<T>

  // 一个标识符 表示是不是ref
  public readonly __v_isRef = true
  // 一个标识符 表示是不是只读的
  public readonly [ReactiveFlags.IS_READONLY]: boolean = false
  //  表示这个计算属性是否可以被缓存
  public _cacheable: boolean

  /**
   * ComputedRefImpl类的构造函数
   * @param getter 一个getter函数
   * @param _setter 一个 setter 函数
   * @param isReadonly 表示是不是只读的
   * @param isSSR 表示是不是服务端渲染(SSR)
   */
  constructor(
    getter: ComputedGetter<T>,
    private readonly _setter: ComputedSetter<T>,
    isReadonly: boolean,
    isSSR: boolean,
  ) {
    // 创建一个新的ReactiveEffect对象
    this.effect = new ReactiveEffect(
      () => getter(this._value), // 参数 函数
      () =>
        // 触发当前对象的值的更新
        triggerRefValue(
          this,
          this.effect._dirtyLevel === DirtyLevels.MaybeDirty_ComputedSideEffect
            ? DirtyLevels.MaybeDirty_ComputedSideEffect
            : DirtyLevels.MaybeDirty,
        ), // 参数 trigger函数
    )
    // 讲新建的effect的computed属性指向当前这个ComputedRefImpl对象
    this.effect.computed = this
    // 不是服务端渲染的话这两个属性就为true，不然为false
    this.effect.active = this._cacheable = !isSSR
    // 设置当前对象是不是只读的
    this[ReactiveFlags.IS_READONLY] = isReadonly
  }
  /**
   * value 访问器 getter 方法，其作用是在访问计算属性值时执行以下逻辑
   */
  get value() {
    // the computed ref may get wrapped by other proxies e.g. readonly() #3376
    // 首先使用 toRaw(this) 获取当前计算属性实例的原始对象。这是因为计算属性可能被其他代理（如 readonly 代理）包裹。
    const self = toRaw(this)

    // 检查是否需要重新计算计算属性的值。  
    // 如果_cacheable为flase 或effect的dirty属性表示为脏状态(即它的依赖项发生了变化)
    // 并且新旧值不同，则重新计算并更新 _value，然后触发依赖更新
    if (
      (!self._cacheable || self.effect.dirty) &&
      hasChanged(self._value, (self._value = self.effect.run()!))
    ) {
      // 使用 triggerRefValue 函数触发依赖更新
      triggerRefValue(self, DirtyLevels.Dirty)
    }
    // 使用 trackRefValue 函数追踪此计算属性的所有依赖 
    trackRefValue(self)
    // 如果计算属性的 effect 的 dirty 级别至少为 MaybeDirty_ComputedSideEffect的话
    // 则触发一个特定类型的依赖更新
    if (self.effect._dirtyLevel >= DirtyLevels.MaybeDirty_ComputedSideEffect) {
      // 使用 triggerRefValue 函数触发依赖更新，不过这次使用DirtyLevels.MaybeDirty_ComputedSideEffect为参数
      triggerRefValue(self, DirtyLevels.MaybeDirty_ComputedSideEffect)
    }
    // 返回计算属性的当前值。
    return self._value
  }
  /**
   * 设置新值
   */
  set value(newValue: T) {
    // 调用构造函数传入的setter函数
    this._setter(newValue)
  }

  // #region polyfill _dirty for backward compatibility third party code for Vue <= 3.3.x
  // 为了向后兼容 Vue 3.3.x 及更早版本的第三方代码，提供了 _dirty 的 getter 和 setter 方法，它们直接代理到 effect.dirty。
  get _dirty() {
    return this.effect.dirty
  }

  set _dirty(v) {
    this.effect.dirty = v
  }
  // #endregion
}

/**
 * Takes a getter function and returns a readonly reactive ref object for the
 * returned value from the getter. It can also take an object with get and set
 * functions to create a writable ref object.
 *
 * @example
 * ```js
 * // Creating a readonly computed ref:
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 *
 * console.log(plusOne.value) // 2
 * plusOne.value++ // error
 * ```
 *
 * ```js
 * // Creating a writable computed ref:
 * const count = ref(1)
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => {
 *     count.value = val - 1
 *   }
 * })
 *
 * plusOne.value = 1
 * console.log(count.value) // 0
 * ```
 *
 * @param getter - Function that produces the next value.
 * @param debugOptions - For debugging. See {@link https://vuejs.org/guide/extras/reactivity-in-depth.html#computed-debugging}.
 * @see {@link https://vuejs.org/api/reactivity-core.html#computed}
 */

// export function computed<T>(
//   getter: ComputedGetter<T>,
//   debugOptions?: DebuggerOptions,
// ): ComputedRef<T>
// export function computed<T>(
//   options: WritableComputedOptions<T>,
//   debugOptions?: DebuggerOptions,
// ): WritableComputedRef<T>

/**

 * computed 函数是 Vue.js 响应式系统中的核心函数之一，用于创建一个计算属性（Computed Property）。
 * 计算属性是基于它们的依赖项进行缓存的，只有当其依赖项发生变化时，它们才会重新计算。
 * 这使得计算属性非常适合于执行开销较大的计算或操作，并且只在必要时更新。
 * @example
 * ```js
 * // Creating a readonly computed ref:
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 *
 * console.log(plusOne.value) // 2
 * plusOne.value++ // error
 * ```
 *
 * ```js
 * // Creating a writable computed ref:
 * const count = ref(1)
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => {
 *     count.value = val - 1
 *   }
 * })
 *
 * plusOne.value = 1
 * console.log(count.value) // 0
 * ```
 * @param getterOrOptions 这是一个函数或一个包含 get 和 set 方法的对象。如果它是一个函数，那么这个函数将用作计算属性的 getter。如果它是一个对象，那么它的 get 方法将用作 getter，set 方法（如果存在）将用作 setter。
 * @param debugOptions  一个可选参数，用于在开发模式下提供额外的调试信息。
 * @param isSSR 可选参数，表示是否处于服务器端渲染（Server-Side Rendering）模式
 * @returns 
 */
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false,
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T>
  // 检查 getterOrOptions 是否是一个函数。如果是，那么它就将这个函数用作 getter，
  // 并创建一个只读的计算属性（setter 将被设置为一个警告函数或 NOOP 函数）。
  const onlyGetter = isFunction(getterOrOptions)
  if (onlyGetter) {
    getter = getterOrOptions
    setter = __DEV__
      ? () => {
        console.warn('Write operation failed: computed value is readonly')
      }
      : NOOP
  } else {
    // 如果 getterOrOptions 是一个对象，那么就从这个对象中提取 get 和 set 方法。
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }
  // 创建一个新的 ComputedRefImpl 实例
  const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter, isSSR)

  if (__DEV__ && debugOptions && !isSSR) {
    cRef.effect.onTrack = debugOptions.onTrack
    cRef.effect.onTrigger = debugOptions.onTrigger
  }
// 返回新创建的ComputedRefImpl对象
  return cRef as any
}
