import type { ComputedRef } from './computed'
import {
  activeEffect,
  shouldTrack,
  trackEffect,
  triggerEffects,
} from './effect'
import { DirtyLevels, TrackOpTypes, TriggerOpTypes } from './constants'
import {
  type IfAny,
  hasChanged,
  isArray,
  isFunction,
  isObject,
} from '@vue/shared'
import {
  isProxy,
  isReactive,
  isReadonly,
  isShallow,
  toRaw,
  toReactive,
} from './reactive'
import type { ShallowReactiveMarker } from './reactive'
import { type Dep, createDep } from './dep'
import { ComputedRefImpl } from './computed'
import { getDepFromReactive } from './reactiveEffect'

declare const RefSymbol: unique symbol
export declare const RawSymbol: unique symbol

export interface Ref<T = any> {
  value: T
  /**
   * Type differentiator only.
   * We need this to be in public d.ts but don't want it to show up in IDE
   * autocomplete, so we use a private Symbol instead.
   */
  [RefSymbol]: true
}

type RefBase<T> = {
  dep?: Dep
  value: T
}
/**
 * 用于追踪 Ref 类型对象的值被访问时的依赖关系。
 * 当一个effect在运行过程中读取 Ref 的值时，该函数会被调用。
 * @param ref 要追踪的响应式引用对象
 */
export function trackRefValue(ref: RefBase<any>) {
  // 如果应该追踪依赖关系并且activeEffect不为undefined(即当前有正在运行的effect)
  if (shouldTrack && activeEffect) {
    // 使用 toRaw(ref) 获取 Ref 对象内部的实际数据存储对象，确保不会因为 Ref 被代理而无法正确地追踪到依赖
    ref = toRaw(ref)
    // 调用 trackEffect 函数，将当前运行的effect(即activeEffect)与刚刚获取或创建的 Dep 关联起来
    // 即将activeEffect添加到ref.dep中
    trackEffect(
      activeEffect,
      // 如果ref.dep为undefined,重新创建一个dep,否则就使用已经存在ref.dep
      // 空值合并运算符??=,只有当左值为undefined或null 时，才会执行createDep函数并将结果赋值给ref.dep
      (ref.dep ??= createDep(
        // cleanup函数,当dep不在需要时，会调用这个函数，
        () => (ref.dep = undefined),
        ref instanceof ComputedRefImpl ? ref : undefined,
      )),
      __DEV__
        ? {
          target: ref,
          type: TrackOpTypes.GET,
          key: 'value',
        }
        : void 0,
    )
  }
}
/**
 * triggerRefValue 函数用于触发一个 Ref 类型值的更新。
 * 当 Ref 值发生变化时，调用此函数会通知所有依赖于该 Ref 的副作用effect重新执行。
 * @param ref 要触发更新的 Ref 对象
 * @param dirtyLevel  指定此次触发更新的“Dirty”级别，默认为 DirtyLevels.Dirty。不同的Dirty级别会影响依赖更新的范围和方式。
 * @param newVal 可选的new Value，通常在 Ref 值变化时提供
 */
export function triggerRefValue(
  ref: RefBase<any>,
  dirtyLevel: DirtyLevels = DirtyLevels.Dirty,
  newVal?: any,
) {
  // 获取Ref对象内部原始的数据存储对象，并确保其上的依赖收集器（dep）有效
  ref = toRaw(ref)
  const dep = ref.dep
  if (dep) {
    // 如果dep存在 则调用 triggerEffects来触发更新
    triggerEffects(
      dep,
      dirtyLevel,
      __DEV__
        ? {
          target: ref,
          type: TriggerOpTypes.SET,
          key: 'value',
          newValue: newVal,
        }
        : void 0,
    )
  }
}

/**
 * Checks if a value is a ref object.
 * isRef 函数用于检查给定的值是否为Ref对象
 * @param r - The value to inspect.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isref}
 */
export function isRef<T>(r: Ref<T> | unknown): r is Ref<T>
export function isRef(r: any): r is Ref {
  // 它通过检查对象上是否存在并等于 true 的 __v_isRef 属性来确定。
  // 如果 r 是 Ref 类型，则函数返回 true；否则返回 false。
  return !!(r && r.__v_isRef === true)
}

/**
 * Takes an inner value and returns a reactive and mutable ref object, which
 * has a single property `.value` that points to the inner value.
 * ref 函数用于创建一个响应式的引用（ref）。
 * 这个引用包装了一个内部值，并允许你以响应式的方式读取和修改这个值
 * @param value - The object to wrap in the ref.
 * @see {@link https://vuejs.org/api/reactivity-core.html#ref}
 */
export function ref<T>(value: T): Ref<UnwrapRef<T>>
export function ref<T = any>(): Ref<T | undefined>
export function ref(value?: unknown) {
  return createRef(value, false)
}

declare const ShallowRefMarker: unique symbol

export type ShallowRef<T = any> = Ref<T> & { [ShallowRefMarker]?: true }

/**
 * Shallow version of {@link ref()}.
 * shallowRef 函数用于创建一个浅响应式引用（shallow reactive reference）
 * @example
 * ```js
 * const state = shallowRef({ count: 1 })
 *
 * // does NOT trigger change
 * state.value.count = 2
 *
 * // does trigger change
 * state.value = { count: 2 }
 * ```
 *
 * @param value - The "inner value" for the shallow ref.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowref}
 */
export function shallowRef<T>(
  value: T,
): Ref extends T
  ? T extends Ref
  ? IfAny<T, ShallowRef<T>, T>
  : ShallowRef<T>
  : ShallowRef<T>
export function shallowRef<T = any>(): ShallowRef<T | undefined>
export function shallowRef(value?: unknown) {
  return createRef(value, true)
}

/**
 * createRef 函数是一个用于创建响应式ref的工厂函数
 * @param rawValue 可以是任何 JavaScript 数据类型，包括基本类型和对象类型。这个值将被包装为响应式引用。
 * @param shallow 用于指示是否应该创建一个浅响应式引用。如果 shallow 为 true，则创建的 Ref 会在其内部值发生变化时触发响应，但如果内部值是一个对象，且该对象的属性发生变化，则不会触发响应。这就是所谓的“浅”响应性
 * @returns 
 */
function createRef(rawValue: unknown, shallow: boolean) {
  // 如果传入的rawValue本身就是ref,直接返回即可
  if (isRef(rawValue)) {
    return rawValue
  }
  // 否则创建一个新的RefImpld对象
  return new RefImpl(rawValue, shallow)
}
/**
 * RefImpl类，它是 Vue.js 响应式系统中 Ref 对象的内部实现。
 * Ref 对象用于包装一个原始值，使其成为一个响应式引用
 */
class RefImpl<T> {
  //  存储响应式值的属性。当 Ref 的值被读取时，会返回这个属性的值
  private _value: T
  //  存储原始值的属性
  private _rawValue: T

  // 一个可选的 Dep 实例，用于存储当前Ref的依赖项
  public dep?: Dep = undefined
  // 标识符，用于表明是不是isRef
  public readonly __v_isRef = true
  /**
   * RefImpl构造函数
   * @param value 包装的原始值
   * @param __v_isShallow 表示是否应使用浅响应处理。
   */
  constructor(
    value: T,
    public readonly __v_isShallow: boolean,
  ) {

    this._rawValue = __v_isShallow ? value : toRaw(value)
    this._value = __v_isShallow ? value : toReactive(value)
  }
  /**
   * 当使用ref.value访问时，会触发这个getter
   */
  get value() {
    // 使用trackRefValue(this) 跟踪该 Ref 的访问，依赖收集时记录依赖关系。
    trackRefValue(this)
    return this._value
  }

  set value(newVal) {
    //  判断是否应该直接使用新值
    const useDirectValue =
      this.__v_isShallow || isShallow(newVal) || isReadonly(newVal)
    // 如果是当前ref对象是浅响应的或newVal是浅响应的或者newVal是只读的,那就直接使用使用newVal,
    // 否则尝试返回newVal的原始值
    newVal = useDirectValue ? newVal : toRaw(newVal)
    // 如果newVal 不等于创建RefImpl对象时的_rawValue值
    if (hasChanged(newVal, this._rawValue)) {
      // 更新原始值  
      this._rawValue = newVal

      // 根据是否应该使用直接值(useDirectValue)来决定是更新为原始值还是响应式值
      this._value = useDirectValue ? newVal : toReactive(newVal)

      //  调用triggerRefValue方法触发依赖于此 Ref 的副作用重新运行。 
      triggerRefValue(this, DirtyLevels.Dirty, newVal)
    }
  }
}

/**
 * Force trigger effects that depends on a shallow ref. This is typically used
 * after making deep mutations to the inner value of a shallow ref.
 * triggerRef函数用于强制触发那些依赖于浅响应的Ref（shallowRef）的副作用函数。
 * 在常规情况下，对浅响应的Ref内部深层属性的更改并不会自动触发依赖于该 Ref依赖的副作用函数的重新执行
 * @example
 * ```js
 * const shallow = shallowRef({
 *   greet: 'Hello, world'
 * })
 *
 * // Logs "Hello, world" once for the first run-through
 * watchEffect(() => {
 *   console.log(shallow.value.greet)
 * })
 *
 * // This won't trigger the effect because the ref is shallow
 * shallow.value.greet = 'Hello, universe'
 *
 * // Logs "Hello, universe"
 * triggerRef(shallow)
 * ```
 *
 * @param ref - The ref whose tied effects shall be executed.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#triggerref}
 */
export function triggerRef(ref: Ref) {
  // 调用 triggerRefValue 函数，并传入 DirtyLevels.Dirty 从而使得所有依赖于该 Ref 的effect函数重新运行。
  triggerRefValue(ref, DirtyLevels.Dirty, __DEV__ ? ref.value : void 0)
}

export type MaybeRef<T = any> = T | Ref<T>
export type MaybeRefOrGetter<T = any> = MaybeRef<T> | (() => T)

/**
 * Returns the inner value if the argument is a ref, otherwise return the
 * argument itself. This is a sugar function for
 * `val = isRef(val) ? val.value : val`.
 * unref 函数是 Vue3 响应式系统中的一个工具函数，用于获取 Ref 或 ComputedRef 对象内部的实际值。
 * 当传入参数 ref 是一个 Ref 或 ComputedRef 类型时， * 该函数返回其 .value 属性；否则直接返回传入的参数。
 * @example
 * ```js
 * function useFoo(x: number | Ref<number>) {
 *   const unwrapped = unref(x)
 *   // unwrapped is guaranteed to be number now
 * }
 * ```
 *
 * @param ref - Ref or plain value to be converted into the plain value.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#unref}
 */
export function unref<T>(ref: MaybeRef<T> | ComputedRef<T>): T {
  return isRef(ref) ? ref.value : ref
}

/**
 * Normalizes values / refs / getters to values.
 * This is similar to {@link unref()}, except that it also normalizes getters.
 * If the argument is a getter, it will be invoked and its return value will
 * be returned.
 *
 * @example
 * ```js
 * toValue(1) // 1
 * toValue(ref(1)) // 1
 * toValue(() => 1) // 1
 * ```
 *
 * @param source - A getter, an existing ref, or a non-function value.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#tovalue}
 */
export function toValue<T>(source: MaybeRefOrGetter<T> | ComputedRef<T>): T {
  return isFunction(source) ? source() : unref(source)
}

const shallowUnwrapHandlers: ProxyHandler<any> = {
  get: (target, key, receiver) => unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key]
    if (isRef(oldValue) && !isRef(value)) {
      oldValue.value = value
      return true
    } else {
      return Reflect.set(target, key, value, receiver)
    }
  },
}

/**
 * Returns a reactive proxy for the given object.
 *
 * If the object already is reactive, it's returned as-is. If not, a new
 * reactive proxy is created. Direct child properties that are refs are properly
 * handled, as well.
 *
 * @param objectWithRefs - Either an already-reactive object or a simple object
 * that contains refs.
 */
export function proxyRefs<T extends object>(
  objectWithRefs: T,
): ShallowUnwrapRef<T> {
  return isReactive(objectWithRefs)
    ? objectWithRefs
    : new Proxy(objectWithRefs, shallowUnwrapHandlers)
}

export type CustomRefFactory<T> = (
  track: () => void,
  trigger: () => void,
) => {
  get: () => T
  set: (value: T) => void
}

class CustomRefImpl<T> {
  public dep?: Dep = undefined

  private readonly _get: ReturnType<CustomRefFactory<T>>['get']
  private readonly _set: ReturnType<CustomRefFactory<T>>['set']

  public readonly __v_isRef = true

  constructor(factory: CustomRefFactory<T>) {
    const { get, set } = factory(
      () => trackRefValue(this),
      () => triggerRefValue(this),
    )
    this._get = get
    this._set = set
  }

  get value() {
    return this._get()
  }

  set value(newVal) {
    this._set(newVal)
  }
}

/**
 * Creates a customized ref with explicit control over its dependency tracking
 * and updates triggering.
 *
 * @param factory - The function that receives the `track` and `trigger` callbacks.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#customref}
 */
export function customRef<T>(factory: CustomRefFactory<T>): Ref<T> {
  return new CustomRefImpl(factory) as any
}

export type ToRefs<T = any> = {
  [K in keyof T]: ToRef<T[K]>
}

/**
 * Converts a reactive object to a plain object where each property of the
 * resulting object is a ref pointing to the corresponding property of the
 * original object. Each individual ref is created using {@link toRef()}.
 *
 * @param object - Reactive object to be made into an object of linked refs.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#torefs}
 */
export function toRefs<T extends object>(object: T): ToRefs<T> {
  if (__DEV__ && !isProxy(object)) {
    console.warn(`toRefs() expects a reactive object but received a plain one.`)
  }
  const ret: any = isArray(object) ? new Array(object.length) : {}
  for (const key in object) {
    ret[key] = propertyToRef(object, key)
  }
  return ret
}

class ObjectRefImpl<T extends object, K extends keyof T> {
  public readonly __v_isRef = true

  constructor(
    private readonly _object: T,
    private readonly _key: K,
    private readonly _defaultValue?: T[K],
  ) { }

  get value() {
    const val = this._object[this._key]
    return val === undefined ? this._defaultValue! : val
  }

  set value(newVal) {
    this._object[this._key] = newVal
  }

  get dep(): Dep | undefined {
    return getDepFromReactive(toRaw(this._object), this._key)
  }
}

class GetterRefImpl<T> {
  public readonly __v_isRef = true
  public readonly __v_isReadonly = true
  constructor(private readonly _getter: () => T) { }
  get value() {
    return this._getter()
  }
}

export type ToRef<T> = IfAny<T, Ref<T>, [T] extends [Ref] ? T : Ref<T>>

/**
 * Used to normalize values / refs / getters into refs.
 *
 * @example
 * ```js
 * // returns existing refs as-is
 * toRef(existingRef)
 *
 * // creates a ref that calls the getter on .value access
 * toRef(() => props.foo)
 *
 * // creates normal refs from non-function values
 * // equivalent to ref(1)
 * toRef(1)
 * ```
 *
 * Can also be used to create a ref for a property on a source reactive object.
 * The created ref is synced with its source property: mutating the source
 * property will update the ref, and vice-versa.
 *
 * @example
 * ```js
 * const state = reactive({
 *   foo: 1,
 *   bar: 2
 * })
 *
 * const fooRef = toRef(state, 'foo')
 *
 * // mutating the ref updates the original
 * fooRef.value++
 * console.log(state.foo) // 2
 *
 * // mutating the original also updates the ref
 * state.foo++
 * console.log(fooRef.value) // 3
 * ```
 *
 * @param source - A getter, an existing ref, a non-function value, or a
 *                 reactive object to create a property ref from.
 * @param [key] - (optional) Name of the property in the reactive object.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#toref}
 */
export function toRef<T>(
  value: T,
): T extends () => infer R
  ? Readonly<Ref<R>>
  : T extends Ref
  ? T
  : Ref<UnwrapRef<T>>
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
): ToRef<T[K]>
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
  defaultValue: T[K],
): ToRef<Exclude<T[K], undefined>>
export function toRef(
  source: Record<string, any> | MaybeRef,
  key?: string,
  defaultValue?: unknown,
): Ref {
  if (isRef(source)) {
    return source
  } else if (isFunction(source)) {
    return new GetterRefImpl(source) as any
  } else if (isObject(source) && arguments.length > 1) {
    return propertyToRef(source, key!, defaultValue)
  } else {
    return ref(source)
  }
}

function propertyToRef(
  source: Record<string, any>,
  key: string,
  defaultValue?: unknown,
) {
  const val = source[key]
  return isRef(val)
    ? val
    : (new ObjectRefImpl(source, key, defaultValue) as any)
}

// corner case when use narrows type
// Ex. type RelativePath = string & { __brand: unknown }
// RelativePath extends object -> true
type BaseTypes = string | number | boolean

/**
 * This is a special exported interface for other packages to declare
 * additional types that should bail out for ref unwrapping. For example
 * \@vue/runtime-dom can declare it like so in its d.ts:
 *
 * ``` ts
 * declare module '@vue/reactivity' {
 *   export interface RefUnwrapBailTypes {
 *     runtimeDOMBailTypes: Node | Window
 *   }
 * }
 * ```
 */
export interface RefUnwrapBailTypes { }

export type ShallowUnwrapRef<T> = {
  [K in keyof T]: DistrubuteRef<T[K]>
}

type DistrubuteRef<T> = T extends Ref<infer V> ? V : T

export type UnwrapRef<T> =
  T extends ShallowRef<infer V>
  ? V
  : T extends Ref<infer V>
  ? UnwrapRefSimple<V>
  : UnwrapRefSimple<T>

export type UnwrapRefSimple<T> = T extends
  | Function
  | BaseTypes
  | Ref
  | RefUnwrapBailTypes[keyof RefUnwrapBailTypes]
  | { [RawSymbol]?: true }
  ? T
  : T extends Map<infer K, infer V>
  ? Map<K, UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Map<any, any>>>
  : T extends WeakMap<infer K, infer V>
  ? WeakMap<K, UnwrapRefSimple<V>> &
  UnwrapRef<Omit<T, keyof WeakMap<any, any>>>
  : T extends Set<infer V>
  ? Set<UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Set<any>>>
  : T extends WeakSet<infer V>
  ? WeakSet<UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof WeakSet<any>>>
  : T extends ReadonlyArray<any>
  ? { [K in keyof T]: UnwrapRefSimple<T[K]> }
  : T extends object & { [ShallowReactiveMarker]?: never }
  ? {
    [P in keyof T]: P extends symbol ? T[P] : UnwrapRef<T[P]>
  }
  : T
