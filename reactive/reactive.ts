import { def, isObject, toRawType } from '@vue/shared'
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReactiveHandlers,
  shallowReadonlyHandlers,
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers,
  shallowCollectionHandlers,
  shallowReadonlyCollectionHandlers,
} from './collectionHandlers'
import type { RawSymbol, Ref, UnwrapRefSimple } from './ref'
import { ReactiveFlags } from './constants'

export interface Target {
  [ReactiveFlags.SKIP]?: boolean
  [ReactiveFlags.IS_REACTIVE]?: boolean
  [ReactiveFlags.IS_READONLY]?: boolean
  [ReactiveFlags.IS_SHALLOW]?: boolean
  [ReactiveFlags.RAW]?: any
}

export const reactiveMap = new WeakMap<Target, any>()
export const shallowReactiveMap = new WeakMap<Target, any>()
export const readonlyMap = new WeakMap<Target, any>()
export const shallowReadonlyMap = new WeakMap<Target, any>()
/**
 * TargetType 枚举类型在 Vue 3 的响应式系统中用来标识目标对象的类型，主要分为以下三种：
 */
enum TargetType {
  // 表示无效或未知的目标类型。这通常用作默认值或错误状态，表明当前的对象类型无法或不应该被转换为响应式对象。
  INVALID = 0,
  // 表示常规的非集合类型的对象，即普通的 JavaScript 对象(如Object，Array)，其属性是可枚举且可以直接通过点表示法访问和修改的。
  COMMON = 1,
  // 表示集合类型的响应式对象，如 Map、Set、WeakMap 和 WeakSet。这些类型的对象在 Vue 3 的响应式系统中具有特殊的处理，因为它们的属性不是通过常规的键值对枚举来访问的。
  // 对于 COLLECTION 类型的对象，Vue 会使用不同的策略来追踪其内部元素的变化，以确保响应式系统的正确性和性能。
  COLLECTION = 2,
}

/**
 * targetTypeMap 函数用于根据给定的原始类型字符串判断其对应的目标类型
 * @param rawType {String} 类型字符串
 * @returns {TargetType}  根据 rawType 的值，函数返回相应的 TargetType 枚举值。
 */
function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION
    default:
      return TargetType.INVALID
  }
}
/**
 * 根据传入的 value（预期是一个响应式对象或原始值）来确定其目标类型。这个函数结合使用了 ReactiveFlags 和 targetTypeMap 来做出决策
 * @param value {Target} 一个响应式对象或原始值
 * @returns  函数返回相应的 TargetType 枚举值
 */
function getTargetType(value: Target) {
  /**
   * 1. 首先，函数检查 value 是否具有 ReactiveFlags.SKIP 属性，并且其值是否为 true。
   * 如果是，这表明该对象被标记为跳过响应式处理，因此函数直接返回 TargetType.INVALID。
   * 2.接下来，函数检查 value 是否是不可扩展的（通过调用 Object.isExtensible(value)）。
   * 如果 value 是不可扩展的，这意味着不能向其添加新的属性，这通常意味着它不是一个普通的 JavaScript 对象。
   * 在这种情况下，函数也返回 TargetType.INVALID。
   */
  return value[ReactiveFlags.SKIP] || !Object.isExtensible(value)
    ? TargetType.INVALID
    // 如果上述两个条件都不满足，函数继续执行，并调用 toRawType(value) 来获取 value 的原始类型（即，如果 value 是一个响应式对象，则获取它包装的原始对象的类型）。
    // toRawType 函数可能会基于 value 的内部属性（如 __v_raw）来确定原始类型。
    // 最后，调用targetTypeMap 将获取到的原始类型映射到相应的 TargetType 枚举值，并返回该值
    : targetTypeMap(toRawType(value))
}


// only unwrap nested ref
export type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRefSimple<T>

/**
 * Returns a reactive proxy of the object.
 *
 * The reactive conversion is "deep": it affects all nested properties. A
 * reactive object also deeply unwraps any properties that are refs while
 * maintaining reactivity.
 *
 * @example
 * ```js
 * const obj = reactive({ count: 0 })
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-core.html#reactive}
 */
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  if (isReadonly(target)) {
    return target
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap,
  )
}

export declare const ShallowReactiveMarker: unique symbol

export type ShallowReactive<T> = T & { [ShallowReactiveMarker]?: true }

/**
 * Shallow version of {@link reactive()}.
 *
 * Unlike {@link reactive()}, there is no deep conversion: only root-level
 * properties are reactive for a shallow reactive object. Property values are
 * stored and exposed as-is - this also means properties with ref values will
 * not be automatically unwrapped.
 *
 * @example
 * ```js
 * const state = shallowReactive({
 *   foo: 1,
 *   nested: {
 *     bar: 2
 *   }
 * })
 *
 * // mutating state's own properties is reactive
 * state.foo++
 *
 * // ...but does not convert nested objects
 * isReactive(state.nested) // false
 *
 * // NOT reactive
 * state.nested.bar++
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowreactive}
 */
export function shallowReactive<T extends object>(
  target: T,
): ShallowReactive<T> {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap,
  )
}

type Primitive = string | number | boolean | bigint | symbol | undefined | null
type Builtin = Primitive | Function | Date | Error | RegExp
export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
  ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends ReadonlyMap<infer K, infer V>
  ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends WeakMap<infer K, infer V>
  ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends Set<infer U>
  ? ReadonlySet<DeepReadonly<U>>
  : T extends ReadonlySet<infer U>
  ? ReadonlySet<DeepReadonly<U>>
  : T extends WeakSet<infer U>
  ? WeakSet<DeepReadonly<U>>
  : T extends Promise<infer U>
  ? Promise<DeepReadonly<U>>
  : T extends Ref<infer U>
  ? Readonly<Ref<DeepReadonly<U>>>
  : T extends {}
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : Readonly<T>

/**
 * Takes an object (reactive or plain) or a ref and returns a readonly proxy to
 * the original.
 *
 * A readonly proxy is deep: any nested property accessed will be readonly as
 * well. It also has the same ref-unwrapping behavior as {@link reactive()},
 * except the unwrapped values will also be made readonly.
 *
 * @example
 * ```js
 * const original = reactive({ count: 0 })
 *
 * const copy = readonly(original)
 *
 * watchEffect(() => {
 *   // works for reactivity tracking
 *   console.log(copy.count)
 * })
 *
 * // mutating original will trigger watchers relying on the copy
 * original.count++
 *
 * // mutating the copy will fail and result in a warning
 * copy.count++ // warning!
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-core.html#readonly}
 */
export function readonly<T extends object>(
  target: T,
): DeepReadonly<UnwrapNestedRefs<T>> {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap,
  )
}

/**
 * Shallow version of {@link readonly()}.
 *
 * Unlike {@link readonly()}, there is no deep conversion: only root-level
 * properties are made readonly. Property values are stored and exposed as-is -
 * this also means properties with ref values will not be automatically
 * unwrapped.
 *
 * @example
 * ```js
 * const state = shallowReadonly({
 *   foo: 1,
 *   nested: {
 *     bar: 2
 *   }
 * })
 *
 * // mutating state's own properties will fail
 * state.foo++
 *
 * // ...but works on nested objects
 * isReadonly(state.nested) // false
 *
 * // works
 * state.nested.bar++
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowreadonly}
 */
export function shallowReadonly<T extends object>(target: T): Readonly<T> {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap,
  )
}

/**
 * 负责创建一个响应式代理对象
 * @param target {Target} 要被代理的原始对象
 * @param isReadonly {Boolean} 指示创建的代理是否是只读的
 * @param baseHandlers {ProxyHandler<any>} 用于普通对象的代理处理程序（就是Proxy的handler参数）
 * @param collectionHandlers {ProxyHandler<any>} 用于集合类型对象（如 Map、Set 等）的代理处理程序
 * @param proxyMap {WeakMap<Target, any>} 用于缓存已经创建的代理对象，以避免重复创建
 * @returns 
 */
function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<Target, any>,
) {
  // 如果 target 不是对象，在开发模式下函数会发出一个警告，并直接返回原始值。
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target is already a Proxy, return it.
  // exception: calling readonly() on a reactive object
  // 如果 target 已经是一个 Proxy 对象，并且不是在只读模式下重新包装一个响应式对象，
  // 则直接返回这个 Proxy 对象。
  if (
    target[ReactiveFlags.RAW] &&
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
  ) {
    return target
  }

  // 使用 proxyMap 检查是否已经为这个 target 创建过代理。如果是，则直接返回缓存的代理对象，避免重复创建。
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }
  //调用 getTargetType 函数来确定 target 的目标类型（是否是普通对象还是集合类型）。
  const targetType = getTargetType(target)
  // 如果目标类型是无效的（TargetType.INVALID），则直接返回原始对象。
  if (targetType === TargetType.INVALID) {
    return target
  }
  // 创建一个新的代理对象
  const proxy = new Proxy(
    target,
    // 基于target类型选择代理处理程序：如果是集合类型，则使用 collectionHandlers；否则，使用 baseHandlers。
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  )
  // 将新创建的代理对象添加到 proxyMap 中
  proxyMap.set(target, proxy)
  return proxy
}

/**
 * Checks if an object is a proxy created by {@link reactive()} or
 * {@link shallowReactive()} (or {@link ref()} in some cases).
 *
 * @example
 * ```js
 * isReactive(reactive({}))            // => true
 * isReactive(readonly(reactive({})))  // => true
 * isReactive(ref({}).value)           // => true
 * isReactive(readonly(ref({})).value) // => true
 * isReactive(ref(true))               // => false
 * isReactive(shallowRef({}).value)    // => false
 * isReactive(shallowReactive({}))     // => true
 * ```
 *
 * @param value - The value to check.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isreactive}
 */
export function isReactive(value: unknown): boolean {
  if (isReadonly(value)) {
    return isReactive((value as Target)[ReactiveFlags.RAW])
  }
  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}

/**
 * Checks whether the passed value is a readonly object. The properties of a
 * readonly object can change, but they can't be assigned directly via the
 * passed object.
 *
 * The proxies created by {@link readonly()} and {@link shallowReadonly()} are
 * both considered readonly, as is a computed ref without a set function.
 *
 * @param value - The value to check.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isreadonly}
 */
export function isReadonly(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
}

export function isShallow(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_SHALLOW])
}

/**
 * Checks if an object is a proxy created by {@link reactive},
 * {@link readonly}, {@link shallowReactive} or {@link shallowReadonly()}.
 *
 * @param value - The value to check.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isproxy}
 */
export function isProxy(value: unknown): boolean {
  return isReactive(value) || isReadonly(value)
}

/**
 * Returns the raw, original object of a Vue-created proxy.
 *
 * `toRaw()` can return the original object from proxies created by
 * {@link reactive()}, {@link readonly()}, {@link shallowReactive()} or
 * {@link shallowReadonly()}.
 *
 * This is an escape hatch that can be used to temporarily read without
 * incurring proxy access / tracking overhead or write without triggering
 * changes. It is **not** recommended to hold a persistent reference to the
 * original object. Use with caution.
 *
 * @example
 * ```js
 * const foo = {}
 * const reactiveFoo = reactive(foo)
 *
 * console.log(toRaw(reactiveFoo) === foo) // true
 * ```
 *
 * @param observed - The object for which the "raw" value is requested.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#toraw}
 */
export function toRaw<T>(observed: T): T {
  const raw = observed && (observed as Target)[ReactiveFlags.RAW]
  return raw ? toRaw(raw) : observed
}

export type Raw<T> = T & { [RawSymbol]?: true }

/**
 * Marks an object so that it will never be converted to a proxy. Returns the
 * object itself.
 *
 * @example
 * ```js
 * const foo = markRaw({})
 * console.log(isReactive(reactive(foo))) // false
 *
 * // also works when nested inside other reactive objects
 * const bar = reactive({ foo })
 * console.log(isReactive(bar.foo)) // false
 * ```
 *
 * **Warning:** `markRaw()` together with the shallow APIs such as
 * {@link shallowReactive()} allow you to selectively opt-out of the default
 * deep reactive/readonly conversion and embed raw, non-proxied objects in your
 * state graph.
 *
 * @param value - The object to be marked as "raw".
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#markraw}
 */
export function markRaw<T extends object>(value: T): Raw<T> {
  if (Object.isExtensible(value)) {
    def(value, ReactiveFlags.SKIP, true)
  }
  return value
}

/**
 * Returns a reactive proxy of the given value (if possible).
 *
 * If the given value is not an object, the original value itself is returned.
 *
 * @param value - The value for which a reactive proxy shall be created.
 */
export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value

/**
 * Returns a readonly proxy of the given value (if possible).
 *
 * If the given value is not an object, the original value itself is returned.
 *
 * @param value - The value for which a readonly proxy shall be created.
 */
export const toReadonly = <T extends unknown>(value: T): T =>
  isObject(value) ? readonly(value) : value
