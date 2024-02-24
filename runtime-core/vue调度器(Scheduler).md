# Vue Scheduler

Vue3中的Scheduler（调度器）是一个关键组件，用于管理响应式系统中任务的执行顺序和时机。在Vue3中，数据变化触发的副作用函数、DOM更新以及生命周期钩子等操作都需要经过调度器来确保按照合适的逻辑顺序执行。

## 类型定义

```typescript

/**
 * SchedulerJob 是 Vue3 中用于调度器（scheduler）的接口，
 * 它扩展了 JavaScript 的 Function 类型，并添加了一些特定于 Vue 内部调度逻辑的属性
 */
export interface SchedulerJob extends Function {
  // 表示调度任务的唯一标识符
  id?: number
  // 如果为 true，表示这个任务应该在 "pre" 阶段执行，即在渲染阶段之前触发
  pre?: boolean

  // 表示该任务是否处于活动状态，即是否正在运行或等待运行。
  active?: boolean
  // 表明这个任务是否与计算属性相关联
  computed?: boolean
  /**
   * Indicates whether the effect is allowed to recursively trigger itself
   * when managed by the scheduler.
   *
   * By default, a job cannot trigger itself because some built-in method calls,
   * e.g. Array.prototype.push actually performs reads as well (#1740) which
   * can lead to confusing infinite loops.
   * The allowed cases are component update functions and watch callbacks.
   * Component update functions may update child component props, which in turn
   * trigger flush: "pre" watch callbacks that mutates state that the parent
   * relies on (#1801). Watch callbacks doesn't track its dependencies so if it
   * triggers itself again, it's likely intentional and it is the user's
   * responsibility to perform recursive state mutation that eventually
   * stabilizes (#1727).
   * 表示当由调度器管理时，该任务是否允许递归地触发自己
   * 默认情况下，一个任务不能递归地触发自身以防止循环依赖和无限循环。
   * 但在某些特殊场景下，如组件更新函数和 watch 回调函数中，允许这种自我触发。
   * 当用户明确知道并负责处理递归状态变更时，可以设置此属性为 true
   */
  allowRecurse?: boolean
  /**
   * Attached by renderer.ts when setting up a component's render effect
   * Used to obtain component information when reporting max recursive updates.
   * dev only.
   * Vue 组件实例的内部引用，仅在开发环境下使用，用于报告最大递归更新次数时提供组件信息
   */
  ownerInstance?: ComponentInternalInstance
}

export type SchedulerJobs = SchedulerJob | SchedulerJob[]
```

## 任务的来源

任务主要来自于两个方面：

1. 组件的状态变化触发的更新任务
2. 开发者通过 API（如 `nextTick`、`watch`、`watchEffect` 等）手动添加的任务。

当组件的状态发生变化时，Vue 会创建一个更新任务，并将其添加到任务队列中。开发者也可以通过相关 API 添加自定义任务到任务队列中。

## **任务分类**

- Scheduler将任务分为预刷新（Pre-Flush）任务和后置刷新（Post-Flush）任务。

  - 预刷新任务：这些任务在DOM更新之前执行，例如计算属性的重新计算或依赖于新状态的副作用函数。

    - 保存在变量`queue`中，

      ```typescript
      const queue: SchedulerJob[] = []
      ```

  - 后置刷新任务：这些任务在DOM更新之后执行，通常包括需要依赖于DOM更新完成后的某些条件才能正确运行的回调函数或者组件生命周期钩子。

    - 由变量`pendingPostFlushCbs`和`activePostFlushCbs`组成,它们分别代表等待执行的任务列表和当前正在执行的任务列表。

      ```typescript
      // 保存待执行的后置刷新任务。这些任务通常在 DOM 更新后执行，如副作用或生命周期钩子。
      const pendingPostFlushCbs: SchedulerJob[] = []
      // 当前正在执行的后置刷新任务列表
      let activePostFlushCbs: SchedulerJob[] | null = null
      ```

调度器会对任务进行排序，确保父组件先于子组件更新，以避免不必要的子组件重渲染

## **任务添加**

### **queueJob**

queueJob 函数用于将给定的 job（即一个 SchedulerJob 对象）添加到任务队列（queue）中

```typescript
/**
 * queueJob 函数用于将给定的 job（即一个 SchedulerJob 对象）添加到任务队列（queue）中。
 * 在执行此操作之前，它会进行一些预处理以避免重复添加相同或递归触发的任务
 * @param job 
 */
export function queueJob(job: SchedulerJob) {
  // the dedupe search uses the startIndex argument of Array.includes()
  // by default the search index includes the current job that is being run
  // so it cannot recursively trigger itself again.
  // if the job is a watch() callback, the search will start with a +1 index to
  // allow it recursively trigger itself - it is the user's responsibility to
  // ensure it doesn't end up in an infinite loop.
  //如果队列不为空就使用 includes 方法检查任务是否已经在队列中。
  // 搜索的起始索引根据 isFlushing 和 job.allowRecurse 的值来确定。如果正在刷新并且任务允许递归，起始索引为 flushIndex + 1；
  // 否则，起始索引为 flushIndex。这是为了防止任务递归地触发自身，除非它是watch callback并且允许递归。
  if (
    !queue.length ||
    !queue.includes(
      job,
      isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex,
    )
  ) {
    // 如果任务的 id 为 null，则将任务直接推到队列的末尾
    if (job.id == null) {
      queue.push(job)
    } else {
      // 否则，使用 splice 方法在指定的索引处插入任务
      queue.splice(findInsertionIndex(job.id), 0, job)
    }
    // 触发任务
    queueFlush()
  }
}

// #2768
// Use binary-search to find a suitable position in the queue,
// so that the queue maintains the increasing order of job's id,
// which can prevent the job from being skipped and also can avoid repeated patching.
/**
 * findInsertionIndex 的函数，用于在Vue3调度器的任务队列（queue）中找到一个合适的插入位置。
 * 这个位置确保了任务队列按照任务的id（递增顺序）进行排序，从而避免跳过任务或重复执行patch操作。
 * 
 * 函数的主要逻辑是使用二分查找算法（binary search）来寻找新任务应该被插入的位置
 * @param id 是要插入的的job的ID
 * @returns 
 */
function findInsertionIndex(id: number) {
  // the start index should be `flushIndex + 1`
  // 初始化起始索引 start 为当前flush索引 flushIndex + 1，表示从下一次待处理的任务开始搜索
  let start = flushIndex + 1
  // 初始化结束索引 end 为整个任务队列的长度
  let end = queue.length
  // 进行循环
  while (start < end) {
    // 计算中间索引 middle使用无符号右移一位实现整数除以2的操作。
    const middle = (start + end) >>> 1
    //获取中间位置的任务对象 middleJob 和其对应的id middleJobId
    const middleJob = queue[middle]
    const middleJobId = getId(middleJob)
    // 如果 middleJobId 小于 id 或者 (middleJobId 等于 id 且 middleJob.pre 为真)，说明待插入任务应该位于中间任务之后，因此将起始索引设置为 middle + 1。
    if (middleJobId < id || (middleJobId === id && middleJob.pre)) {
      start = middle + 1
    } else {
      // 否则，说明待插入任务应该位于中间任务之前或正好是中间任务的位置，将结束索引设置为 middle
      end = middle
    }
  }
  // 返回更新后的起始索引 start，它就是新任务应插入的位置
  return start
}
```

### queuePostFlushCb

 queuePostFlushCb 函数用于将给定的cb添加到后置刷新回调队列（pendingPostFlushCbs）中

```typescript
/**
 * queuePostFlushCb 函数用于将给定的cb添加到Vue3调度器的后置刷新回调队列（pendingPostFlushCbs）中。
 * 这个函数主要用于在DOM更新之后执行一些副作用操作，例如组件生命周期钩子。
 * @param cb 
 * 
 * queuePostFlushCb 保证了在DOM更新后的适当时间点能够执行指定的回调函数，
 * 这对于那些依赖于DOM更新完成后的操作非常有用，比如某些特定的DOM操作或状态更新等。
 */
export function queuePostFlushCb(cb: SchedulerJobs) {
  if (!isArray(cb)) {
    // 对于非数组
    // 如果activePostFlushCbs为undefined或者 cb 不在 activePostFlushCbs 中或者它允许递归调用并且不在当前递归索引之后的位置，
    // 那么 cb 就会被添加到 pendingPostFlushCbs 数组中
    if (
      !activePostFlushCbs ||
      !activePostFlushCbs.includes(
        cb,
        cb.allowRecurse ? postFlushIndex + 1 : postFlushIndex,
      )
    ) {
      // 将cb 添加到 pendingPostFlushCbs数组中
      pendingPostFlushCbs.push(cb)
    }
  } else {
    // if cb is an array, it is a component lifecycle hook which can only be
    // triggered by a job, which is already deduped in the main queue, so
    // we can skip duplicate check here to improve perf
    // 如果 cb 是数组，这意味着它是一个组件的生命周期钩子，这些钩子通常只能由job触发，而这些job已经在主队列中进行了去重处理。
    // 因此，在这种情况下，我们可以跳过重复检查，直接将数组中的所有回调函数添加到 pendingPostFlushCbs 数组中。
    pendingPostFlushCbs.push(...cb)
  }
  // 触发队列刷新
  queueFlush()
}

```

## 任务的触发

### **queueFlush**

```typescript
/**
 * queueFlush 函数在Vue3的调度器中起到触发异步任务执行的作用
 */
function queueFlush() {
  // 检查当前是否有任务正在执行（isFlushing）或是否有待处理的任务执行请求（isFlushPending）
  if (!isFlushing && !isFlushPending) {
    // 如果都没有,将 isFlushPending 设置为 true，表示有一个待处理的任务已经提交，等待处理
    isFlushPending = true
    //resolvedPromise 是一个已经完成状态的Promise对象，所以.then() 方法将会在下一个事件循环（微任务阶段）中执行。
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}
```

### **flushPreFlushCbs**

```typescript
/**
 * flushPreFlushCbs 函数用于执行预刷新回调（即标记了 pre: true 的任务）的函数。
 * 这个函数的主要作用是在DOM更新之前处理这些预先定义好的回调。
 * @param instance 可选的内部组件实例，用于检查回调是否与当前组件关联
 * @param seen 在开发环境下使用的映射表，用于跟踪递归调用以防止无限循环
 * @param i 初始索引值，如果当前正在进行刷新过程，则从当前正在处理的任务之后的一个任务开始处理
 * 
 * 通过 flushPreFlushCbs 函数，Vue3能够在DOM更新前正确地执行一系列预先定义好的回调操作，这对于依赖于DOM更新前状态的操作非常有用
 */
export function flushPreFlushCbs(
  instance?: ComponentInternalInstance,
  seen?: CountMap,
  // if currently flushing, skip the current job itself
  i = isFlushing ? flushIndex + 1 : 0,
) {
  // 如果是开发环境，初始化一个空的映射表 seen 用于存储已执行过回调的信息
  if (__DEV__) {
    seen = seen || new Map()
  }
  // 使用一个循环遍历任务队列（queue）从给定的初始索引 i 开始查找并执行具有 pre: true 属性的任务
  for (; i < queue.length; i++) {
    const cb = queue[i]

    if (cb && cb.pre) {
      // 检查当前任务是否属于指定的组件实例（若传入了 instance 参数）
      // 这是因为在定义job时会将组件的uid赋值给job的id
      if (instance && cb.id !== instance.uid) {
        // 如果不属于instance组件实例，则执行下一个循环
        continue
      }
      // 在开发环境下，使用 checkRecursiveUpdates 函数检查是否存在递归调用的情况，如果有则跳过该任务
      if (__DEV__ && checkRecursiveUpdates(seen!, cb)) {
        continue
      }
      // 否则从队列中删除
      queue.splice(i, 1)
      i--
      // 并立即执行该任务
      cb()
    }
  }
}
```

### **flushPostFlushCbs**

```typescript
/**
 * flushPostFlushCbs 函数是用于执行所有待处理的后置刷新回调（即标记为需要在DOM更新后执行的任务）的函数。这个函数的主要作用是在DOM更新之后处理这些任务
 * @param seen 仅在开发环境下使用，用于跟踪递归调用以防止无限循环
 * @returns 
 */
export function flushPostFlushCbs(seen?: CountMap) {
  // 存在待处理的后置刷新任务
  if (pendingPostFlushCbs.length) {
    // 先去重并根据id排序
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b),
    )
    // 清空pendingPostFlushCbs
    pendingPostFlushCbs.length = 0

    // #1947 already has active queue, nested flushPostFlushCbs call
    // 如果已经存在了activePostFlushCbs，那么将去重后的deduped添加到activePostFlushCbs中退出即可
    // 这通常发生在嵌套调用 flushPostFlushCbs 的情况下。
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped)
      return
    }
    // 将去重后的job数组赋值给全局变量 activePostFlushCbs，这代表当前正在执行的后置刷新回调队列
    activePostFlushCbs = deduped
    // 在开发环境下初始化映射表 seen 用于存储已执行过的回调信息。
    if (__DEV__) {
      seen = seen || new Map()
    }
    // 循环遍历 activePostFlushCbs 数组
    for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length;
      postFlushIndex++
    ) {
      // 检查是否有递归调用的情况（通过 checkRecursiveUpdates 函数），如果有则跳过该回调
      if (
        __DEV__ &&
        checkRecursiveUpdates(seen!, activePostFlushCbs[postFlushIndex])
      ) {
        continue
      }
      // 执行每一个回调任务
      activePostFlushCbs[postFlushIndex]()
    }
    // 任务执行完成，重置activePostFlushCbs和postFlushIndex
    activePostFlushCbs = null
    postFlushIndex = 0
  }
}
```

### **flushJobs**

```typescript
/**
 * flushJobs 函数是Vue3调度器的核心函数之一，用于处理任务队列（queue）中的所有待执行的任务
 * @param seen  用于跟踪递归调用以防止无限循环 在开发环境下使用
 */
function flushJobs(seen?: CountMap) {
  // isFlushPending 设置为 false，表示没有待处理的刷新
  isFlushPending = false
  // isFlushing 被设置为 true，表示正在执行刷新任务
  isFlushing = true


  // 如果在开发环境下，初始化一个映射表 seen 用于跟踪递归调用以防止无限循环
  if (__DEV__) {
    seen = seen || new Map()
  }

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller
  //    priority number)
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.
  // 对任务队列进行排序。排序的目的确保：
  // 1.组件按照从父到子的顺序更新。这是因为父组件总是在子组件之前创建(组件的uid是一个uid变量从0开始自增的)
  // 2.如果在父组件更新过程中某个子组件被卸载，则其更新可以被跳过
  queue.sort(comparator)

  // conditional usage of checkRecursiveUpdate must be determined out of
  // try ... catch block since Rollup by default de-optimizes treeshaking
  // inside try-catch. This can leave all warning code unshaked. Although
  // they would get eventually shaken by a minifier like terser, some minifiers
  // would fail to do that (e.g. https://github.com/evanw/esbuild/issues/1610)
  // 如果是开发模式，它会创建一个函数 check 来检查每个作业是否会导致递归更新。
  // 如果不是开发模式，check 函数将是一个不执行任何操作的函数 (NOOP)。
  const check = __DEV__
    ? (job: SchedulerJob) => checkRecursiveUpdates(seen!, job)
    : NOOP


  try {
    // 在 try 块中，函数遍历队列中的每个job
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      // 检查job是否存在且job.active不为false
      if (job && job.active !== false) {
        if (__DEV__ && check(job)) {
          continue
        }
        // 使用callWithErrorHandling函数执行job，便于在发生错误时捕捉显示错误信息
        callWithErrorHandling(job, null, ErrorCodes.SCHEDULER)
      }
    }
  } finally {
    // 将 flushIndex 重置为0，表示已完成一轮任务处理
    flushIndex = 0
    // 将任务队列长度设为0，清空队列。
    queue.length = 0

    // 调用 flushPostFlushCbs 处理后置刷新回调。
    flushPostFlushCbs(seen)

    // 重置 isFlushing 状态和 currentFlushPromise
    isFlushing = false
    currentFlushPromise = null
    // some postFlushCb queued jobs!
    // keep flushing until it drains.
    // 如果任务队列仍有剩余任务或者有等待处理的后置刷新回调，
    // 则递归调用flushJobs 进行下一轮刷新操作，直到队列完全清空
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs(seen)
    }
  }
}
```

## 异步更新策略

Vue 3 采用了异步更新策略。这是为了优化性能并确保UI渲染的流畅性。在Vue中，当响应式数据发生变化时，并不会立即触发DOM更新，而是将所有需要进行更新的工作队列化并在下一个事件循环的微任务阶段执行

### 为什么需要异步更新策略？

在 Vue 3 中，使用的是基于 Proxy构建的响应式系统。这个系统会在数据发生变化时自动更新视图。如果频繁更新数据，性能会受到很大的影响，因为每次数据变化都会导致组件的重新渲染，这可能会消耗大量的计算资源和时间。

为了解决这个问题， 引入了异步更新策略。这种策略的核心思想是将组件的更新推迟到下一个事件循环中执行。这样做的好处是可以合并多次数据更新操作，减少不必要的重复渲染，从而提高性能。

### **异步更新的核心机制**

1. **依赖收集与调度器**：
   - Vue通过响应式系统跟踪组件内部对状态的依赖关系，当状态变化时，会自动识别出哪些组件视图需要重新渲染。
   - 调度器（Scheduler）负责管理这些待处理的任务，包括计算属性、watchEffect等副作用函数和实际的DOM更新操作。
2. **宏任务与微任务**：
   - 当状态变更发生时，Vue并不立即同步更新DOM，而是将这个过程推迟到当前宏任务结束后的微任务阶段。
   - 宏任务包括如脚本执行、setTimeout回调，UI渲染等等；微任务包括Promise.then()、MutationObserver回调以及queueMicrotask()方法。
3. **事件循环流程**：
   - 在事件循环中，当执行完当前的宏任务队列中的任务，然后开始执行微任务队列中任务。
   - Vue正是利用这一特性，将DOM更新任务放入微任务队列，这样可以确保在一个事件循环内连续处理多个任务，一次性完成所有必要的DOM更新，减少不必要的重绘和重排。

### 异步更新策略的优点

异步更新策略带来了以下几个优点：

- **性能提升**：批量处理DOM更新减少了页面渲染的频率，避免了频繁的重排和重绘从而提高了应用的性能。
- **更好的用户体验**：减少了因频繁渲染导致的界面卡顿和延迟，提高了应用的响应性和用户体验。
- **简化开发**：开发者不需要手动管理数据更新的时机和频率，可以更加专注于业务逻辑的实现。

### 注意事项

虽然异步更新策略带来了很多好处，但也需要注意以下几点：

- **状态读取不一致**：在异步更新过程中，组件的状态可能会发生变化，这可能会导致在读取状态时出现不一致的情况。因此，开发者需要确保在读取状态时考虑到异步更新的可能性。
- **nextTick 的使用**：如果需要在 DOM 更新后立即执行某些操作，可以使用 Vue 提供的 `nextTick` API。`nextTick` 会将回调函数添加到微任务队列中，确保在 DOM 更新完成后立即执行。

## **nextTick**

`nextTick()`允许开发者注册一个回调函数，在下一次DOM更新后执行。这个回调实际上会被添加到微任务队列中，这样它就能在当前所有数据变化引起的DOM更新完成之后被执行

源码：

```typescript
/**
 * nextTick 允许开发者注册一个回调函数，在下一次DOM更新后执行。
 * 它返回一个Promise对象，该Promise在下一次事件循环的微任务阶段解析。
 * nextTick 的核心原理就是利用Promise和事件循环机制，在下一次DOM更新后的微任务阶段执行用户提供的回调函数。
 * @param fn 一个函数
 * @returns 
 */
export function nextTick<T = void, R = void>(
  this: T,
  fn?: (this: T) => R,
): Promise<Awaited<R>> {
  // 获取当前正在执行过程中的Promise对象 currentFlushPromise，如果没有正在进行的任务，则使用已经解决的Promise对象 resolvedPromise 作为默认值。
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}
```

### 为什么需要 `nextTick`？

Vue 的响应式系统是基于异步更新的。这意味着当你改变一个响应式属性时，Vue 不会立即更新 DOM，而是会等待所有属性变化完成后，再在下一个事件循环中执行更新。这种策略是为了避免不必要的计算和渲染，提高性能。

但是，有时候我们需要在 DOM 更新后立即执行某些代码，比如获取更新后的 DOM 元素或者执行依赖于最新 DOM 状态的操作。这时，我们就需要使用 `nextTick`。

### `nextTick` 的使用示例

```vue
<script setup>
import { ref, nextTick } from 'vue'

const count = ref(0)

async function increment() {
  count.value++

  // DOM 还未更新
  console.log(document.getElementById('counter').textContent) // 0

  await nextTick()
  // DOM 此时已经更新
  console.log(document.getElementById('counter').textContent) // 1
}
</script>

<template>
  <button id="counter" @click="increment">{{ count }}</button>
</template>
```

### `nextTick` 的工作原理

`nextTick` 的工作原理与 JavaScript 的事件循环和微任务队列密切相关。

1. **微任务队列**：`nextTick` 将传入的回调函数添加到微任务队列中。
2. **事件循环**：在当前的宏任务（比如一个事件处理函数或定时器回调）执行完毕后，JavaScript 会检查微任务队列，并执行其中的所有任务。
3. **DOM 更新**：由于 Vue 的异步更新策略，DOM 的更新通常会在当前的宏任务执行完毕后，但在微任务执行之前完成。
4. **执行回调**：因此，当微任务队列中的任务开始执行时，`nextTick` 的回调函数会被调用，此时 DOM 已经更新完成。

### 注意事项

- `nextTick` 只在 Vue 实例的方法内部有效。如果你尝试在普通的 JavaScript 函数中使用它，它将不会工作。
- `nextTick` 回调函数的执行是延迟的，它不会立即执行。
- `nextTick` 只会等待 Vue 的 DOM 更新，它不会等待其他可能存在的异步操作，比如 setTimeout 或 AJAX 请求。

### 替代方案

除了 `nextTick`，你还可以使用 `Promise.then` 或 `MutationObserver` 或`queueMicrotask`来实现类似的功能。这些方法都可以用来在 DOM 更新后执行代码，但它们的实现方式和性能特性可能略有不同。







## scheduler.ts源码

```typescript
import { ErrorCodes, callWithErrorHandling, handleError } from './errorHandling'
import { type Awaited, NOOP, isArray } from '@vue/shared'
import { type ComponentInternalInstance, getComponentName } from './component'

/**
 * SchedulerJob 是 Vue3 中用于调度器（scheduler）的接口，
 * 它扩展了 JavaScript 的 Function 类型，并添加了一些特定于 Vue 内部调度逻辑的属性
 */
export interface SchedulerJob extends Function {
  // 表示调度任务的唯一标识符
  id?: number
  // 如果为 true，表示这个任务应该在 "pre" 阶段执行，即在渲染阶段之前触发
  pre?: boolean

  // 表示该任务是否处于活动状态，即是否正在运行或等待运行。
  active?: boolean
  // 表明这个任务是否与计算属性相关联
  computed?: boolean
  /**
   * Indicates whether the effect is allowed to recursively trigger itself
   * when managed by the scheduler.
   *
   * By default, a job cannot trigger itself because some built-in method calls,
   * e.g. Array.prototype.push actually performs reads as well (#1740) which
   * can lead to confusing infinite loops.
   * The allowed cases are component update functions and watch callbacks.
   * Component update functions may update child component props, which in turn
   * trigger flush: "pre" watch callbacks that mutates state that the parent
   * relies on (#1801). Watch callbacks doesn't track its dependencies so if it
   * triggers itself again, it's likely intentional and it is the user's
   * responsibility to perform recursive state mutation that eventually
   * stabilizes (#1727).
   * 表示当由调度器管理时，该任务是否允许递归地触发自己
   * 默认情况下，一个任务不能递归地触发自身以防止循环依赖和无限循环。
   * 但在某些特殊场景下，如组件更新函数和 watch 回调函数中，允许这种自我触发。
   * 当用户明确知道并负责处理递归状态变更时，可以设置此属性为 true
   */
  allowRecurse?: boolean
  /**
   * Attached by renderer.ts when setting up a component's render effect
   * Used to obtain component information when reporting max recursive updates.
   * dev only.
   * Vue 组件实例的内部引用，仅在开发环境下使用，用于报告最大递归更新次数时提供组件信息
   */
  ownerInstance?: ComponentInternalInstance
}

export type SchedulerJobs = SchedulerJob | SchedulerJob[]

// 表示当前是否正在执行刷新操作（即更新 DOM 或执行其他相关任务）
let isFlushing = false
// 表示是否有待处理的刷新操作。这通常用于判断是否需要开始一个新的刷新周期
let isFlushPending = false

// 在 Vue3 中，将任务分为预刷新（pre-flush）任务和后置刷新（post-flush）任务。预刷新任务通常包含那些需要在 DOM 更新前执行的操作，
// 例如计算属性的重新计算；后置刷新任务则是在 DOM 更新后执行，如某些副作用或生命周期钩子
// 这是一个存储待执行任务的数组（SchedulerJob[]）。这些任务可能包括组件的更新、计算属性的重新计算等。
const queue: SchedulerJob[] = []
// 表示当前正在处理的队列中的任务索引。
let flushIndex = 0

// 保存待执行的后置刷新任务。这些任务通常在 DOM 更新后执行，如副作用或生命周期钩子。
const pendingPostFlushCbs: SchedulerJob[] = []
// 当前正在执行的后置刷新任务列表
let activePostFlushCbs: SchedulerJob[] | null = null
// 表示当前正在处理的 activePostFlushCbs 中的任务索引
let postFlushIndex = 0

// 预先解析的 Promise，用于确保异步任务按照预期的顺序执行。通过链式调用 .then()，可以确保任务在微任务队列中按照添加的顺序执行。
const resolvedPromise = /*#__PURE__*/ Promise.resolve() as Promise<any>
// 表示当前正在执行的刷新周期的 Promise。这有助于跟踪和管理异步任务。
let currentFlushPromise: Promise<void> | null = null
// 这是一个常量，用于限制递归的深度。
const RECURSION_LIMIT = 100
// 这是一个类型定义，表示一个映射（Map），将 SchedulerJob 映射到一个数字（通常是计数器）。这可以用于跟踪特定任务的执行次数或其他相关信息。
type CountMap = Map<SchedulerJob, number>

/**
 * nextTick 允许开发者注册一个回调函数，在下一次DOM更新后执行。
 * 它返回一个Promise对象，该Promise在下一次事件循环的微任务阶段解析。
 * nextTick 的核心原理就是利用Promise和事件循环机制，在下一次DOM更新后的微任务阶段执行用户提供的回调函数。
 * @param fn 一个函数
 * @returns 
 */
export function nextTick<T = void, R = void>(
  this: T,
  fn?: (this: T) => R,
): Promise<Awaited<R>> {
  // 获取当前正在进行刷新过程中的Promise对象 currentFlushPromise，如果没有正在进行的任务，则使用已经解决的Promise对象 resolvedPromise 作为默认值。
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}

// #2768
// Use binary-search to find a suitable position in the queue,
// so that the queue maintains the increasing order of job's id,
// which can prevent the job from being skipped and also can avoid repeated patching.
/**
 * findInsertionIndex 的函数，用于在Vue3调度器的任务队列（queue）中找到一个合适的插入位置。
 * 这个位置确保了任务队列按照任务的id（递增顺序）进行排序，从而避免跳过任务或重复执行patch操作。
 * 
 * 函数的主要逻辑是使用二分查找算法（binary search）来寻找新任务应该被插入的位置
 * @param id 是要插入的的job的ID
 * @returns 
 */
function findInsertionIndex(id: number) {
  // the start index should be `flushIndex + 1`
  // 初始化起始索引 start 为当前flush索引 flushIndex + 1，表示从下一次待处理的任务开始搜索
  let start = flushIndex + 1
  // 初始化结束索引 end 为整个任务队列的长度
  let end = queue.length
  // 进行循环
  while (start < end) {
    // 计算中间索引 middle使用无符号右移一位实现整数除以2的操作。
    const middle = (start + end) >>> 1
    //获取中间位置的任务对象 middleJob 和其对应的id middleJobId
    const middleJob = queue[middle]
    const middleJobId = getId(middleJob)
    // 如果 middleJobId 小于 id 或者 (middleJobId 等于 id 且 middleJob.pre 为真)，说明待插入任务应该位于中间任务之后，因此将起始索引设置为 middle + 1。
    if (middleJobId < id || (middleJobId === id && middleJob.pre)) {
      start = middle + 1
    } else {
      // 否则，说明待插入任务应该位于中间任务之前或正好是中间任务的位置，将结束索引设置为 middle
      end = middle
    }
  }
  // 返回更新后的起始索引 start，它就是新任务应插入的位置
  return start
}
/**
 * queueJob 函数用于将给定的 job（即一个 SchedulerJob 对象）添加到任务队列（queue）中。
 * 在执行此操作之前，它会进行一些预处理以避免重复添加相同或递归触发的任务
 * @param job 
 */
export function queueJob(job: SchedulerJob) {
  // the dedupe search uses the startIndex argument of Array.includes()
  // by default the search index includes the current job that is being run
  // so it cannot recursively trigger itself again.
  // if the job is a watch() callback, the search will start with a +1 index to
  // allow it recursively trigger itself - it is the user's responsibility to
  // ensure it doesn't end up in an infinite loop.
  //如果队列不为空就使用 includes 方法检查任务是否已经在队列中。
  // 搜索的起始索引根据 isFlushing 和 job.allowRecurse 的值来确定。如果正在刷新并且任务允许递归，起始索引为 flushIndex + 1；
  // 否则，起始索引为 flushIndex。这是为了防止任务递归地触发自身，除非它是watch callback并且允许递归。
  if (
    !queue.length ||
    !queue.includes(
      job,
      isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex,
    )
  ) {
    // 如果任务的 id 为 null，则将任务直接推到队列的末尾
    if (job.id == null) {
      queue.push(job)
    } else {
      // 否则，使用 splice 方法在指定的索引处插入任务
      queue.splice(findInsertionIndex(job.id), 0, job)
    }
    // 触发任务
    queueFlush()
  }
}
/**
 * queueFlush 函数在Vue3的调度器中起到触发异步任务执行的作用
 */
function queueFlush() {
  // 检查当前是否有任务正在执行（isFlushing）或是否有待处理的任务执行请求（isFlushPending）
  if (!isFlushing && !isFlushPending) {
    // 如果都没有,将 isFlushPending 设置为 true，表示有一个待处理的任务已经提交，等待处理
    isFlushPending = true
    //resolvedPromise 是一个已经完成状态的Promise对象，所以.then() 方法将会在下一个事件循环（微任务阶段）中执行。
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}
/**
 * 从任务队列（queue）中移除指定的 SchedulerJob 对象
 * @param job 一个SchedulerJob对象
 */
export function invalidateJob(job: SchedulerJob) {
  const i = queue.indexOf(job)
  // 如果找到的索引值大于当前正在处理的任务索引值（flushIndex），说明该 job 位于待处理队列中还未执行的部分。
  // 这是因为 flushIndex 表示已开始处理但尚未完成的任务的最大索引，所以小于等于 flushIndex 的任务可能已经执行完毕或正在执行，不应该移除。
  // 若索引值大于 flushIndex，则表明该 job 尚未被执行，可以安全地从队列中移除。
  if (i > flushIndex) {
    queue.splice(i, 1)
  }
}
/**
 * queuePostFlushCb 函数用于将给定的cb添加到Vue3调度器的后置刷新回调队列（pendingPostFlushCbs）中。
 * 这个函数主要用于在DOM更新之后执行一些副作用操作，例如组件生命周期钩子。
 * @param cb 
 * 
 * queuePostFlushCb 保证了在DOM更新后的适当时间点能够执行指定的回调函数，
 * 这对于那些依赖于DOM更新完成后的操作非常有用，比如某些特定的DOM操作或状态更新等。
 */
export function queuePostFlushCb(cb: SchedulerJobs) {
  if (!isArray(cb)) {
    // 对于非数组
    // 如果activePostFlushCbs为undefined或者 cb 不在 activePostFlushCbs 中或者它允许递归调用并且不在当前递归索引之后的位置，
    // 那么 cb 就会被添加到 pendingPostFlushCbs 数组中
    if (
      !activePostFlushCbs ||
      !activePostFlushCbs.includes(
        cb,
        cb.allowRecurse ? postFlushIndex + 1 : postFlushIndex,
      )
    ) {
      // 将cb 添加到 pendingPostFlushCbs数组中
      pendingPostFlushCbs.push(cb)
    }
  } else {
    // if cb is an array, it is a component lifecycle hook which can only be
    // triggered by a job, which is already deduped in the main queue, so
    // we can skip duplicate check here to improve perf
    // 如果 cb 是数组，这意味着它是一个组件的生命周期钩子，这些钩子通常只能由job触发，而这些job已经在主队列中进行了去重处理。
    // 因此，在这种情况下，我们可以跳过重复检查，直接将数组中的所有回调函数添加到 pendingPostFlushCbs 数组中。
    pendingPostFlushCbs.push(...cb)
  }
  // 触发队列刷新
  queueFlush()
}
/**
 * flushPreFlushCbs 函数用于执行预刷新回调（即标记了 pre: true 的任务）的函数。
 * 这个函数的主要作用是在DOM更新之前处理这些预先定义好的回调。
 * @param instance 可选的内部组件实例，用于检查回调是否与当前组件关联
 * @param seen 在开发环境下使用的映射表，用于跟踪递归调用以防止无限循环
 * @param i 初始索引值，如果当前正在进行刷新过程，则从当前正在处理的任务之后的一个任务开始处理
 * 
 * 通过 flushPreFlushCbs 函数，Vue3能够在DOM更新前正确地执行一系列预先定义好的回调操作，这对于依赖于DOM更新前状态的操作非常有用
 */
export function flushPreFlushCbs(
  instance?: ComponentInternalInstance,
  seen?: CountMap,
  // if currently flushing, skip the current job itself
  i = isFlushing ? flushIndex + 1 : 0,
) {
  // 如果是开发环境，初始化一个空的映射表 seen 用于存储已执行过回调的信息
  if (__DEV__) {
    seen = seen || new Map()
  }
  // 使用一个循环遍历任务队列（queue）从给定的初始索引 i 开始查找并执行具有 pre: true 属性的任务
  for (; i < queue.length; i++) {
    const cb = queue[i]

    if (cb && cb.pre) {
      // 检查当前任务是否属于指定的组件实例（若传入了 instance 参数）
      // 这是因为在定义job时会将组件的uid赋值给job的id
      if (instance && cb.id !== instance.uid) {
        // 如果不属于instance组件实例，则执行下一个循环
        continue
      }
      // 在开发环境下，使用 checkRecursiveUpdates 函数检查是否存在递归调用的情况，如果有则跳过该任务
      if (__DEV__ && checkRecursiveUpdates(seen!, cb)) {
        continue
      }
      // 否则从队列中删除
      queue.splice(i, 1)
      i--
      // 并立即执行该任务
      cb()
    }
  }
}
/**
 * flushPostFlushCbs 函数是用于执行所有待处理的后置刷新回调（即标记为需要在DOM更新后执行的任务）的函数。这个函数的主要作用是在DOM更新之后处理这些任务
 * @param seen 仅在开发环境下使用，用于跟踪递归调用以防止无限循环
 * @returns 
 */
export function flushPostFlushCbs(seen?: CountMap) {
  // 存在待处理的后置刷新任务
  if (pendingPostFlushCbs.length) {
    // 先去重并根据id排序
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b),
    )
    // 清空pendingPostFlushCbs
    pendingPostFlushCbs.length = 0

    // #1947 already has active queue, nested flushPostFlushCbs call
    // 如果已经存在了activePostFlushCbs，那么将去重后的deduped添加到activePostFlushCbs中退出即可
    // 这通常发生在嵌套调用 flushPostFlushCbs 的情况下。
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped)
      return
    }
    // 将去重后的job数组赋值给全局变量 activePostFlushCbs，这代表当前正在执行的后置刷新回调队列
    activePostFlushCbs = deduped
    // 在开发环境下初始化映射表 seen 用于存储已执行过的回调信息。
    if (__DEV__) {
      seen = seen || new Map()
    }
    // 循环遍历 activePostFlushCbs 数组
    for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length;
      postFlushIndex++
    ) {
      // 检查是否有递归调用的情况（通过 checkRecursiveUpdates 函数），如果有则跳过该回调
      if (
        __DEV__ &&
        checkRecursiveUpdates(seen!, activePostFlushCbs[postFlushIndex])
      ) {
        continue
      }
      // 执行每一个回调任务
      activePostFlushCbs[postFlushIndex]()
    }
    // 任务执行完成，重置activePostFlushCbs和postFlushIndex
    activePostFlushCbs = null
    postFlushIndex = 0
  }
}

const getId = (job: SchedulerJob): number =>
  job.id == null ? Infinity : job.id

const comparator = (a: SchedulerJob, b: SchedulerJob): number => {
  const diff = getId(a) - getId(b)
  if (diff === 0) {
    if (a.pre && !b.pre) return -1
    if (b.pre && !a.pre) return 1
  }
  return diff
}
/**
 * flushJobs 函数是Vue3调度器的核心函数之一，用于处理任务队列（queue）中的所有待执行的任务
 * @param seen  用于跟踪递归调用以防止无限循环 在开发环境下使用
 */
function flushJobs(seen?: CountMap) {
  // isFlushPending 设置为 false，表示没有待处理的刷新
  isFlushPending = false
  // isFlushing 被设置为 true，表示正在执行刷新任务
  isFlushing = true


  // 如果在开发环境下，初始化一个映射表 seen 用于跟踪递归调用以防止无限循环
  if (__DEV__) {
    seen = seen || new Map()
  }

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller
  //    priority number)
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.
  // 对任务队列进行排序。排序的目的确保：
  // 1.组件按照从父到子的顺序更新。这是因为父组件总是在子组件之前创建(组件的uid是一个uid变量从0开始自增的)
  // 2.如果在父组件更新过程中某个子组件被卸载，则其更新可以被跳过
  queue.sort(comparator)

  // conditional usage of checkRecursiveUpdate must be determined out of
  // try ... catch block since Rollup by default de-optimizes treeshaking
  // inside try-catch. This can leave all warning code unshaked. Although
  // they would get eventually shaken by a minifier like terser, some minifiers
  // would fail to do that (e.g. https://github.com/evanw/esbuild/issues/1610)
  // 如果是开发模式，它会创建一个函数 check 来检查每个作业是否会导致递归更新。
  // 如果不是开发模式，check 函数将是一个不执行任何操作的函数 (NOOP)。
  const check = __DEV__
    ? (job: SchedulerJob) => checkRecursiveUpdates(seen!, job)
    : NOOP


  try {
    // 在 try 块中，函数遍历队列中的每个job
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      // 检查job是否存在且job.active不为false
      if (job && job.active !== false) {
        if (__DEV__ && check(job)) {
          continue
        }
        // 使用callWithErrorHandling函数执行job，便于在发生错误时捕捉显示错误信息
        callWithErrorHandling(job, null, ErrorCodes.SCHEDULER)
      }
    }
  } finally {
    // 将 flushIndex 重置为0，表示已完成一轮任务处理
    flushIndex = 0
    // 将任务队列长度设为0，清空队列。
    queue.length = 0

    // 调用 flushPostFlushCbs 处理后置刷新回调。
    flushPostFlushCbs(seen)

    // 重置 isFlushing 状态和 currentFlushPromise
    isFlushing = false
    currentFlushPromise = null
    // some postFlushCb queued jobs!
    // keep flushing until it drains.
    // 如果任务队列仍有剩余任务或者有等待处理的后置刷新回调，
    // 则递归调用flushJobs 进行下一轮刷新操作，直到队列完全清空
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs(seen)
    }
  }
}

function checkRecursiveUpdates(seen: CountMap, fn: SchedulerJob) {
  if (!seen.has(fn)) {
    seen.set(fn, 1)
  } else {
    const count = seen.get(fn)!
    if (count > RECURSION_LIMIT) {
      const instance = fn.ownerInstance
      const componentName = instance && getComponentName(instance.type)
      handleError(
        `Maximum recursive updates exceeded${componentName ? ` in component <${componentName}>` : ``
        }. ` +
        `This means you have a reactive effect that is mutating its own ` +
        `dependencies and thus recursively triggering itself. Possible sources ` +
        `include component template, render function, updated hook or ` +
        `watcher source function.`,
        null,
        ErrorCodes.APP_ERROR_HANDLER,
      )
      return true
    } else {
      seen.set(fn, count + 1)
    }
  }
}

```

