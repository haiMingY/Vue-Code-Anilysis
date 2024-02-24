import {
  type ComputedRef,
  type DebuggerOptions,
  type EffectScheduler,
  ReactiveEffect,
  ReactiveFlags,
  type Ref,
  getCurrentScope,
  isReactive,
  isRef,
  isShallow,
} from '@vue/reactivity'
import { type SchedulerJob, queueJob } from './scheduler'
import {
  EMPTY_OBJ,
  NOOP,
  extend,
  hasChanged,
  isArray,
  isFunction,
  isMap,
  isObject,
  isPlainObject,
  isSet,
  isString,
  remove,
} from '@vue/shared'
import {
  type ComponentInternalInstance,
  currentInstance,
  isInSSRComponentSetup,
  setCurrentInstance,
} from './component'
import {
  ErrorCodes,
  callWithAsyncErrorHandling,
  callWithErrorHandling,
} from './errorHandling'
import { queuePostRenderEffect } from './renderer'
import { warn } from './warning'
import { DeprecationTypes } from './compat/compatConfig'
import { checkCompatEnabled, isCompatEnabled } from './compat/compatConfig'
import type { ObjectWatchOptionItem } from './componentOptions'
import { useSSRContext } from './helpers/useSsrContext'

export type WatchEffect = (onCleanup: OnCleanup) => void

export type WatchSource<T = any> = Ref<T> | ComputedRef<T> | (() => T)

export type WatchCallback<V = any, OV = any> = (
  value: V,
  oldValue: OV,
  onCleanup: OnCleanup,
) => any

type MapSources<T, Immediate> = {
  [K in keyof T]: T[K] extends WatchSource<infer V>
  ? Immediate extends true
  ? V | undefined
  : V
  : T[K] extends object
  ? Immediate extends true
  ? T[K] | undefined
  : T[K]
  : never
}

type OnCleanup = (cleanupFn: () => void) => void

export interface WatchOptionsBase extends DebuggerOptions {
  flush?: 'pre' | 'post' | 'sync'
}

export interface WatchOptions<Immediate = boolean> extends WatchOptionsBase {
  immediate?: Immediate
  deep?: boolean
  once?: boolean
}

export type WatchStopHandle = () => void

// Simple effect.
/**
 * 用于执行一个带有副作用（side effect）的函数，并自动追踪该函数内部对响应式状态的依赖。
 * 当任何依赖项发生变化时，会立即重新执行这个副作用函数
 * @param effect 一个要运行的副作用函数。
 * @param options 允许你配置观察行为。例如，你可以设置 immediate 选项来立即执行一次effect
 * @returns 
 */
export function watchEffect(
  effect: WatchEffect,
  options?: WatchOptionsBase,
): WatchStopHandle {
  // 调用doWatch并传入了effect作为第一个参数，
  // 将第二个参数设置为null，表示不需要监听回调函数，仅关注副作用的执行。
  // 这样，当依赖的状态发生变化时，effect函数会被自动重新运行以反映最新的状态变化。
  // 最后，watchEffect返回一个停止函数（WatchStopHandle），可以通过调用该函数来停止对副作用的监听和执行。
  return doWatch(effect, null, options)
}

export function watchPostEffect(
  effect: WatchEffect,
  options?: DebuggerOptions,
) {
  return doWatch(
    effect,
    null,
    __DEV__ ? extend({}, options as any, { flush: 'post' }) : { flush: 'post' },
  )
}

export function watchSyncEffect(
  effect: WatchEffect,
  options?: DebuggerOptions,
) {
  return doWatch(
    effect,
    null,
    __DEV__ ? extend({}, options as any, { flush: 'sync' }) : { flush: 'sync' },
  )
}

// initial value for watchers to trigger on undefined initial values
const INITIAL_WATCHER_VALUE = {}

type MultiWatchSources = (WatchSource<unknown> | object)[]

// overload: single source + cb
export function watch<T, Immediate extends Readonly<boolean> = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle

// overload: array of multiple sources + cb
export function watch<
  T extends MultiWatchSources,
  Immediate extends Readonly<boolean> = false,
>(
  sources: [...T],
  cb: WatchCallback<MapSources<T, false>, MapSources<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle

// overload: multiple sources w/ `as const`
// watch([foo, bar] as const, () => {})
// somehow [...T] breaks when the type is readonly
export function watch<
  T extends Readonly<MultiWatchSources>,
  Immediate extends Readonly<boolean> = false,
>(
  source: T,
  cb: WatchCallback<MapSources<T, false>, MapSources<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle

// overload: watching reactive object w/ cb
export function watch<
  T extends object,
  Immediate extends Readonly<boolean> = false,
>(
  source: T,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchOptions<Immediate>,
): WatchStopHandle

// implementation
/**
 * watch函数是用来监听一个响应式数据源，并在数据源发生变化时执行回调函数
 * @param source 要观察的数据源
 * @param cb 回调函数
 * @param options 可选参数，用于配置监听行为
 * @returns 
 */
export function watch<T = any, Immediate extends Readonly<boolean> = false>(
  source: T | WatchSource<T>,
  cb: any,
  options?: WatchOptions<Immediate>,
): WatchStopHandle {
  // 首先进行开发环境下的类型检查和警告提示。
  // 在开发模式下，如果传入的第二个参数不是函数，会抛出警告并提示开发者应该使用watchEffect API。
  if (__DEV__ && !isFunction(cb)) {
    warn(
      `\`watch(fn, options?)\` signature has been moved to a separate API. ` +
      `Use \`watchEffect(fn, options?)\` instead. \`watch\` now only ` +
      `supports \`watch(source, cb, options?) signature.`,
    )
  }
  // 调用doWatch函数来处理实际的监听逻辑和副作用调度
  return doWatch(source as any, cb, options)
}
/**
 * doWatch 是Vue3源码中的一个核心函数，用于处理组件实例的响应式监听（watch）。
 * 它负责处理观察逻辑，包括追踪依赖、调度回调函数的执行，并提供了停止观察的机制。
 * @param source  要观察的数据源，可以是单个响应式对象、响应式对象数组、另一个 watchEffect，或者任何可以被观察的值。
 * @param cb 当数据源变化时执行的回调函数。对于 watchEffect 而言，这个参数是 null，因为 watchEffect 会自动收集依赖。
 * @param options 观察选项对象，允许你配置观察的行为，如 immediate（是否立即执行回调）、deep（是否深度观察对象内部的变化）、flush（回调的执行时机）等。
 * @returns 
 */
function doWatch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb: WatchCallback | null,
  {
    immediate,
    deep,
    flush,
    once,
    onTrack,
    onTrigger,
  }: WatchOptions = EMPTY_OBJ,
): WatchStopHandle {
  // 如果回调函数存在，却option.once为true,则将cb进行包装，确保在调用一次后，取消监听
  if (cb && once) {
    const _cb = cb
    cb = (...args) => {
      _cb(...args)
      unwatch()
    }
  }

  // TODO remove in 3.5
  if (__DEV__ && deep !== void 0 && typeof deep === 'number') {
    warn(
      `watch() "deep" option with number value will be used as watch depth in future versions. ` +
      `Please use a boolean instead to avoid potential breakage.`,
    )
  }

  if (__DEV__ && !cb) {
    if (immediate !== undefined) {
      warn(
        `watch() "immediate" option is only respected when using the ` +
        `watch(source, callback, options?) signature.`,
      )
    }
    if (deep !== undefined) {
      warn(
        `watch() "deep" option is only respected when using the ` +
        `watch(source, callback, options?) signature.`,
      )
    }
    if (once !== undefined) {
      warn(
        `watch() "once" option is only respected when using the ` +
        `watch(source, callback, options?) signature.`,
      )
    }
  }

  const warnInvalidSource = (s: unknown) => {
    warn(
      `Invalid watch source: `,
      s,
      `A watch source can only be a getter/effect function, a ref, ` +
      `a reactive object, or an array of these types.`,
    )
  }

  // 获取当前的组件实例
  const instance = currentInstance
  // 定义一个reactiveGetter函数，用于处理响应式对象。
  // 如果深度监听（deep === true），则直接返回源对象，在后续包装的getter中进行遍历；
  const reactiveGetter = (source: object) =>
    deep === true
      ? source // traverse will happen in wrapped getter below
      : // for deep: false, only traverse root-level properties
      traverse(source, deep === false ? 1 : undefined) // 否则仅遍历根级属性。
  // 初始化一个getter函数
  let getter: () => any
  // 一个布尔值，用于确定是否需要强制触发某些操作（例如更新）
  let forceTrigger = false
  // 一个布尔值，用于标记源数据是否是一个数组（即多个源）
  let isMultiSource = false
  // 如果source是Ref类型
  if (isRef(source)) {
    //getter 返回一个解包后的值 
    getter = () => source.value
    //  根据source是不是isShallow 确定是否需要强制触发。
    forceTrigger = isShallow(source)
  } else if (isReactive(source)) { //如果source是一个响应式对象
    // 则getter返回 reactiveGetter处理过的值
    getter = () => reactiveGetter(source)
    // 设置需要强制更新
    forceTrigger = true
  } else if (isArray(source)) {
    // source是一个数组，将isMultiSource设置为true
    isMultiSource = true
    // forceTrigger的值则是判断source源数组中是否含有响应式对象或者浅响应的source
    forceTrigger = source.some(s => isReactive(s) || isShallow(s))
    // getter的值也得是一个数组
    getter = () =>
      source.map(s => {
        // 如果source是Ref类型 getter 返回一个解包后的值 
        if (isRef(s)) {
          return s.value
        } else if (isReactive(s)) {
          // 如果source是一个响应式对象 则getter是 reactiveGetter处理过的值
          return reactiveGetter(s)
        } else if (isFunction(s)) { //如果原数据是一个函数 则调用该函数如果出错并显示错误
          return callWithErrorHandling(s, instance, ErrorCodes.WATCH_GETTER)
        } else {
          __DEV__ && warnInvalidSource(s)
        }
      })
  } else if (isFunction(source)) {
    // 如果源数据是函数，则调用该函数如果出错并显示错误
    if (cb) {
      // getter with cb
      getter = () =>
        callWithErrorHandling(source, instance, ErrorCodes.WATCH_GETTER)
    } else {
      // no cb -> simple effect
      getter = () => {
        // 如果cleanup函数存在，先调用cleanup函数
        if (cleanup) {
          cleanup()
        }
        return callWithAsyncErrorHandling(
          source,
          instance,
          ErrorCodes.WATCH_CALLBACK,
          [onCleanup],
        )
      }
    }
  } else {
    getter = NOOP
    __DEV__ && warnInvalidSource(source)
  }

  // 2.x array mutation watch compat
  if (__COMPAT__ && cb && !deep) {
    const baseGetter = getter
    getter = () => {
      const val = baseGetter()
      if (
        isArray(val) &&
        checkCompatEnabled(DeprecationTypes.WATCH_ARRAY, instance)
      ) {
        traverse(val)
      }
      return val
    }
  }
  // 当存在回调函数cb且需要深度监听（deep）时
  if (cb && deep) {
    // getter会被重新定义为先执行baseGetter，再对其结果进行遍历操作。
    const baseGetter = getter
    // 用于深度观察响应式对象的所有嵌套属性。这样就可以为所有属性和新建的effect建立依赖关系
    getter = () => traverse(baseGetter())
  }
  // 初始化一个清理函数引用变量cleanup
  let cleanup: (() => void) | undefined

  // 并定义一个onCleanup函数用于在停止watcher时执行清理任务。

  let onCleanup: OnCleanup = (fn: () => void) => {
    // 同时将当前effect的onStop方法设置为执行清理函数。
    cleanup = effect.onStop = () => {
      // 当调用onCleanup传入的清理函数fn时，会通过callWithErrorHandling函数执行以便在发生错误时捕获错误，
      callWithErrorHandling(fn, instance, ErrorCodes.WATCH_CLEANUP)
      // 清理后清空cleanup和effect.onStop引用
      cleanup = effect.onStop = undefined
    }
  }

  // in SSR there is no need to setup an actual effect, and it should be noop
  // unless it's eager or sync flush
  // 针对服务器端渲染（SSR）场景：
  let ssrCleanup: (() => void)[] | undefined
  if (__SSR__ && isInSSRComponentSetup) {
    // we will also not call the invalidate callback (+ runner is not set up)
    onCleanup = NOOP
    if (!cb) {
      getter()
    } else if (immediate) {
      callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
        getter(),
        isMultiSource ? [] : undefined,
        onCleanup,
      ])
    }
    if (flush === 'sync') {
      const ctx = useSSRContext()!
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = [])
    } else {
      return NOOP
    }
  }
  // 初始化一个变量oldValue用于存储旧值。
  // 如果是多数据源监听，创建一个与source数组长度相同的数组，并用INITIAL_WATCHER_VALUE(一个空对象)填充；
  // 否则直接赋值为INITIAL_WATCHER_VALUE。
  let oldValue: any = isMultiSource
    ? new Array((source as []).length).fill(INITIAL_WATCHER_VALUE)
    : INITIAL_WATCHER_VALUE
  // 定义一个名为job的调度任务
  const job: SchedulerJob = () => {
    // 判断effect是否活跃(如果为false则表明stop了)和脏（即是否有更新）
    if (!effect.active || !effect.dirty) {
      return
    }
    // 如果存在回调函数cb，表示是watch(source, cb)模式
    if (cb) {
      // watch(source, cb)

      // 运行effect获取新值
      const newValue = effect.run()
      // 如果是deep为true 或者forceTrigger为true或者源数据发生了变化
      if (
        deep ||
        forceTrigger ||
        (isMultiSource
          ? (newValue as any[]).some((v, i) => hasChanged(v, oldValue[i]))
          : hasChanged(newValue, oldValue)) ||
        (__COMPAT__ &&
          isArray(newValue) &&
          isCompatEnabled(DeprecationTypes.WATCH_ARRAY, instance))
      ) {
        // cleanup before running cb again
        // 如果有cleanup函数，先调用
        if (cleanup) {
          cleanup()
        }
        // 然后使用callWithAsyncErrorHandling执行cs函数，以便在发生错误是捕捉错误
        callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
          newValue,
          // pass undefined as the old value when it's changed for the first time
          oldValue === INITIAL_WATCHER_VALUE
            ? undefined
            : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE
              ? []
              : oldValue,
          onCleanup,
        ])
        oldValue = newValue
      }
    } else {
      // 若不存在回调函数cb，表示是watchEffect模式，仅运行effect以执行副作用。
      // watchEffect
      effect.run()
    }
  }

  // important: mark the job as a watcher callback so that scheduler knows
  // it is allowed to self-trigger (#1727)
  // allowRecurse标志用于告诉调度器这个 job 是否允许自我触发。
  // 对于watch（有回调函数的情况），它通常允许自我触发；而对于 watchEffect`，则不允许。
  job.allowRecurse = !!cb

  // 根据传入的flush策略设置scheduler（调度器）
  let scheduler: EffectScheduler
  if (flush === 'sync') {
    // 如果是同步（'sync'），直接将job作为调度器
    scheduler = job as any // the scheduler function gets called directly
  } else if (flush === 'post') {
    // 如果是后渲染（'post'），该函数会在后渲染阶段调用queuePostRenderEffect方法添加job到指定的队列中，
    // 并可能使用组件实例的Suspense上下文。如果有则将job添加到suspense.effects数组中或者调用queuePostFlushCb函数
    scheduler = () => queuePostRenderEffect(job, instance && instance.suspense)
  } else {
    // 默认情况下（'pre'），设置job.pre标志为true，并在有组件实例的情况下为其赋予一个唯一的id，
    // 然后定义调度器为一个将job加入到任务队列中的函数。
    // default: 'pre'
    job.pre = true
    if (instance) job.id = instance.uid
    scheduler = () => queueJob(job)
  }
  // 创建一个新的ReactiveEffect实例，传入getter函数、tirgger函数为空操作NOOP和上述定义的scheduler
  // 收集依赖
  const effect = new ReactiveEffect(getter, NOOP, scheduler)

  // 获取当前作用域(scope)，
  const scope = getCurrentScope()
  // 并定义unwatch函数来停止effect并在scope中移除它
  const unwatch = () => {
    effect.stop()
    if (scope) {
      remove(scope.effects, effect)
    }
  }

  if (__DEV__) {
    effect.onTrack = onTrack
    effect.onTrigger = onTrigger
  }

  // initial 
  // // 如果存在回调函数cb
  if (cb) {
    // 且需要立即执行（immediate），则直接运行job
    if (immediate) {
      job()
    } else {
      // 否则运行effect获取值
      oldValue = effect.run()
    }
  } else if (flush === 'post') {
    // 如果不存在回调函数cb，但是flush策略为'post'：
    // 将effect.run.bind(effect)包装后传递给queuePostRenderEffect方法，在组件渲染后的某个阶段（如DOM更新后）执行effect。
    // 同时，如果当前有实例(instance)且支持Suspense特性，还会将instance.suspense作为参数传入。effect会被添加到suspense.effects数组中或者使用queuePostFlushCb函数
    // 如果没有传入instance.suspense，则 使用queuePostFlushCb函数

    // 反正最后还是调用的queuePostFlushCb函数只是调用的时机不同
    queuePostRenderEffect(
      effect.run.bind(effect),
      instance && instance.suspense,
    )
  } else {
    // 如果既不存在回调函数cb，flush策略也不是'post'，那么直接调用effect.run()执行效果
    effect.run()
  }
  // 如果是在SSR环境中，将unwatch函数添加到ssrCleanup数组以便后续清理。
  if (__SSR__ && ssrCleanup) ssrCleanup.push(unwatch)
  // 最后返回unwatch函数，用于在适当的时候停止对source的监听和相关副作用的执行
  return unwatch
}

// this.$watch
export function instanceWatch(
  this: ComponentInternalInstance,
  source: string | Function,
  value: WatchCallback | ObjectWatchOptionItem,
  options?: WatchOptions,
): WatchStopHandle {
  const publicThis = this.proxy as any
  const getter = isString(source)
    ? source.includes('.')
      ? createPathGetter(publicThis, source)
      : () => publicThis[source]
    : source.bind(publicThis, publicThis)
  let cb
  if (isFunction(value)) {
    cb = value
  } else {
    cb = value.handler as Function
    options = value
  }
  const reset = setCurrentInstance(this)
  const res = doWatch(getter, cb.bind(publicThis), options)
  reset()
  return res
}

export function createPathGetter(ctx: any, path: string) {
  const segments = path.split('.')
  return () => {
    let cur = ctx
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]]
    }
    return cur
  }
}

/**
 * traverse 函数 用于遍历 JavaScript 对象、数组、Set、Map以及响应式引用（Ref）的值。
 * 这个函数的主要目的是遍历对象的所有嵌套属性，同时处理循环引用的情况和确保在给定的深度限制内进行遍历
 * @param value 需要遍历的值，可以是任何类型
 * @param depth  可选参数，表示遍历的最大深度。如果提供了这个参数并且当前遍历的深度超过了这个值，那么遍历就会停止。
 * @param currentDepth 当前遍历的深度，默认为 0
 * @param seen 一个 Set 集合，用于存储已经遍历过的值，以防止循环引用导致的无限遍历
 * @returns 
 */
export function traverse(
  value: unknown,
  depth?: number,
  currentDepth = 0,
  seen?: Set<unknown>,
) {
  // 函数检查 value 是否是一个对象，如果不是对象或者对象上有 ReactiveFlags.SKIP 标志，那么就直接返回 value
  if (!isObject(value) || (value as any)[ReactiveFlags.SKIP]) {
    return value
  }
  // 如果提供了 depth 参数并且当前深度 currentDepth 大于等于 depth，那么也直接返回 value
  if (depth && depth > 0) {
    if (currentDepth >= depth) {
      return value
    }
    currentDepth++
  }
  // 如果没有提供 seen 参数，那么就创建一个新的 Set 集合。
  seen = seen || new Set()
  // 然后检查 value 是否已经在 seen 中，如果在就直接返回 value，以防止循环引用。
  if (seen.has(value)) {
    return value
  }
  // 将 value 添加到 seen 集合中
  seen.add(value)
  if (isRef(value)) {
    // 如果 value 是一个响应式引用（Ref），那么就对 value.value 进行遍历
    traverse(value.value, depth, currentDepth, seen)
  } else if (isArray(value)) {
    // 如果 value 是一个数组，那么就遍历数组中的每个元素。
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, currentDepth, seen)
    }
  } else if (isSet(value) || isMap(value)) {
    // 如果 value 是一个Set或Map，那么就遍历Set或Map中的每个值
    value.forEach((v: any) => {
      traverse(v, depth, currentDepth, seen)
    })
  } else if (isPlainObject(value)) {
    // 如果 value 是一个普通对象，那么就遍历对象的每个属性
    for (const key in value) {
      traverse(value[key], depth, currentDepth, seen)
    }
  }
  // 返回遍历过的 value
  return value
}
