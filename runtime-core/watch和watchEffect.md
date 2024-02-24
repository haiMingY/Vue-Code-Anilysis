# watch和watchEffect

在Vue3中，`watch`和`watchEffect`是用于监听数据变化并执行副作用（side effects）的两个重要API。

## **watch**

`watch` API允许你监听一个或多个响应式数据源（如ref、reactive对象属性等），并在这些数据源发生变化时执行特定的回调函数。

**类型定义与参数说明：**

```typescript
// 监听单个数据源
function watch<T>(
  source: WatchSource<T>,
  callback: WatchCallback<T>,
  options?: WatchOptions
): StopHandle

// 监听多个数据源
function watch<T>(
  sources: WatchSource<T>[],
  callback: WatchCallback<T[]>,
  options?: WatchOptions
): StopHandle
```

1. **source（数据源）**：
   - 单个数据源可以是一个返回值的getter函数、一个ref对象，或者是一个reactive对象。
   - 若需要同时监听多个数据源，则传入一个包含多个数据源的数组。

2. **callback（回调函数）**：
   - 当数据源发生变化时，该函数会被调用。当监听单个数据源时，回调函数接收三个参数：newValue、oldValue以及onCleanup清理副作用的回调函数；当监听多个数据源时，newValue和oldValue分别以数组形式传递。
   
3. **options（可选配置项）**：
   - `immediate`: 如果设置为 `true`，则在创建watcher时立即触发回调，旧值将为 `undefined`。
   - `deep`: 默认为 `false`，若设为 `true`，则会对对象进行深度监测，当对象内部属性发生变更时也会触发回调。
   - `flush`: 控制回调刷新时机，可选 'pre'、'post' 或 'sync'，默认为 'pre'。默认情况下，watcher会在组件渲染之前运行（'pre'）。设置为'post'则会在组件渲染之后运行。若需要在响应式依赖变化时立即触发watcher，可设为"sync"，但这可能导致性能和数据一致性问题，尤其是在同一时间更新多个属性的情况下。详情请查看[回调函数的触发时机](https://vuejs.org/guide/essentials/watchers.html#callback-flush-timing)
   - `onTrack` 和 `onTrigger`: 调试钩子函数，用于观察依赖追踪和效果触发事件。
   - `once`: 如果设置为 `true`，则只执行一次回调，在第一次回调执行完毕后自动停止监视器。

**使用示例：**

- 监听getter函数：

```javascript
const state = reactive({ count: 0 });
watch(
  () => state.count,
   // 回调函数，有两个参数：新值(newVal)和旧值(oldVal) 
  (count, prevCount) => {
    // ...
  }
);
```

- 直接监听ref：

```javascript
const count = ref(0);
watch(count, (newCount, oldCount) => {
  // ...
});
```

- 多个数据源：

```javascript
const fooRef = ref('foo');
const barRef = ref('bar');

watch([fooRef, barRef], ([newFoo, newBar], [oldFoo, oldBar]) => {
  // ...
});
```

- 使用`{ deep: true }`监听对象深层变更：

```javascript
const state = reactive({ nested: { count: 0 } });

watch(
  () => state.nested,
  (newValue, oldValue) => {
    // ...
  },
  { deep: true }
);
```

- 停止watcher：

```javascript
const stopWatch = watch(source, callback);

// 在需要的时候停止监听
stopWatch();
```

- 清理副作用：

```javascript
watch(id, async (newId, oldId, onCleanup) => {
  const { response, cancel } = doAsyncWork(newId);
  onCleanup(() => cancel()); // 当id改变并重新执行异步任务时，取消未完成的任务
  data.value = await response;
});
```

- 
  特点：
  - 需要显式指定需要监听的属性及其对应的回调函数。

  - 提供了访问旧值的能力，可以对比新旧值进行处理。

  - 具有灵活的配置选项，比如是否立即触发、是否深度监听等。


## **watchEffect**

`watchEffect` API会自动追踪当前作用域内所有响应式依赖，并在其变化时重新执行提供的回调函数。

**类型定义：**

```typescript
function watchEffect(
  effect: (onCleanup: OnCleanup) => void,
  options?: WatchEffectOptions
): StopHandle

type OnCleanup = (cleanupFn: () => void) => void

interface WatchEffectOptions {
  flush?: 'pre' | 'post' | 'sync' // 默认为 'pre'
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

type StopHandle = () => void
```

**详细说明：**

- **第一个参数**：
  - `effect` 函数是需要运行的副作用函数。这个函数接收一个回调函数作为参数（`onCleanup`），用来注册清理回调。当effect函数即将再次运行前，清理回调会被调用，用于清除无效的副作用，例如取消挂起的异步请求。

- **第二个参数**：
  - 可选的 `options` 对象可以用来调整效应函数的刷新时机或调试其依赖关系。

    - `flush`: 控制回调刷新时机，可选 'pre'、'post' 或 'sync'，默认为 'pre'。默认情况下，watcher会在组件渲染之前运行（'pre'）。设置为'post'则会在组件渲染之后运行。若需要在响应式依赖变化时立即触发watcher，可设为"sync"，但这可能导致性能和数据一致性问题，尤其是在同一时间更新多个属性的情况下。详情请查看[回调函数的触发时机](https://vuejs.org/guide/essentials/watchers.html#callback-flush-timing)

    - `onTrack` 和 `onTrigger`: 调试钩子函数，用于观察依赖追踪和效果触发事件。

- **返回值**：
  - 返回值是一个停止函数，调用它可以停止运行该watchEffect。

示例：

```javascript
const count = ref(0);

watchEffect(() => console.log(count.value));
// -> 输出 0

count.value++;
// -> 输出 1
```

副作用清理：

```javascript
watchEffect(async (onCleanup) => {
  const { response, cancel } = doAsyncWork(id.value);
  // 如果id改变，`cancel`将被调用以取消上一次未完成的请求
  onCleanup(cancel);
  data.value = await response;
});
```

停止监视器：

```javascript
const stop = watchEffect(() => {});

// 当不再需要此监视器时：
stop();
```

配置选项示例：

```javascript
watchEffect(() => {}, {
  flush: 'post',
  onTrack(e) {
    debugger; // 调试依赖追踪事件
  },
  onTrigger(e) {
    debugger; // 调试触发事件
  }
});
```

```javascript
import { ref, watchEffect } from 'vue'

const count = ref(0)

watchEffect(() => {
  console.log(`Current count is: ${count.value}`)
})
```

特点：
- 不需要明确指定要监听的具体属性，而是根据回调函数内部实际使用的响应式数据自动收集依赖。
- 每次执行都会获取所有依赖的新值，并基于这些值执行副作用操作。
- 默认情况下，在创建时立即执行一次，不需要手动设置`immediate`选项。
- 不提供旧值作为参数，因为它关注的是每次执行时最新的状态。

## 总结

`watch`和`watchEffect`都是Vue3中用于响应式执行副作用的函数，但它们在跟踪依赖的方式上有主要区别：

1. **watch：**
   - `watch`仅跟踪显式指定的观察源。也就是说，它不会追踪回调函数内部访问到的所有响应式属性。
   - 回调函数只有当所观察的数据源实际发生变化时才会触发。
   - 使用`watch`时，开发者可以明确地指出要监听哪些数据源的变化来执行相应的副作用，提供了更精确的控制回调触发时机的能力。
2. **watchEffect：**
   - `watchEffect`将依赖跟踪和副作用执行合并为一个阶段。在同步执行过程中，它会自动跟踪所有访问过的响应式属性作为依赖项。
   - 这种方式编写代码更为简洁方便，无需明确指明每一个依赖关系，但同时意味着它的响应式依赖关系不如`watch`那样显式清晰。

## 源码分析

### watch源码

```typescript

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
```

### watchEffect源码

```typescript
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
  // 调用doWatch来处理实际的监听逻辑和副作用调度并传入了effect作为第一个参数，
  // 将第二个参数设置为null，表示不需要监听回调函数，仅关注副作用的执行。
  // 这样，当依赖的状态发生变化时，effect函数会被自动重新运行以反映最新的状态变化。
  // 最后，watchEffect返回一个停止函数（WatchStopHandle），可以通过调用该函数来停止对副作用的监听和执行。
  return doWatch(effect, null, options)
}
```

### doWatch函数源码

```typescript

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
```

