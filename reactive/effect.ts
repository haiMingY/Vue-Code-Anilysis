import { NOOP, extend } from '@vue/shared'
import type { ComputedRefImpl } from './computed'
import {
  DirtyLevels,
  type TrackOpTypes,
  type TriggerOpTypes,
} from './constants'
import type { Dep } from './dep'
import { type EffectScope, recordEffectScope } from './effectScope'

export type EffectScheduler = (...args: any[]) => any

export type DebuggerEvent = {
  effect: ReactiveEffect
} & DebuggerEventExtraInfo

export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}
// 全局变量 用于存储当前激活状态的  ReactiveEffect实例
export let activeEffect: ReactiveEffect | undefined

export class ReactiveEffect<T = any> {
  // 表示该 effect 是否处于活跃状态
  active = true
  // 存储所有依赖项（Dep）的数组，每个 Dep 对象代表一个被追踪的响应式对象或计算属性
  deps: Dep[] = []

  /**
   * Can be attached after creation
   * 用于关联计算属性,当一个 effect 与计算属性相关联时，它的更新逻辑就会绑定到该计算属性的值变化上。
   * 这意味着在创建 effect 后，可以将其与一个计算属性关联起来，这样每当计算属性的依赖发生变化并重新计算值时，effect 就会被触发执行。
   * @internal
   */
  computed?: ComputedRefImpl<T>
  /**
   * 允许递归调用
   * @internal
   */
  allowRecurse?: boolean

  // stop回调
  onStop?: () => void
  // dev only
  onTrack?: (event: DebuggerEvent) => void
  // dev only
  onTrigger?: (event: DebuggerEvent) => void

  /**
   * 表示 effect 的脏状态(dirty state)，用来决定何时需要重新执行 effect 函数
   * 默认为需要立即执行的状态
   * @internal
   */
  _dirtyLevel = DirtyLevels.Dirty
  /**
   * @internal
   */
  _trackId = 0
  /**
   * @internal
   */
  _runnings = 0
  /**
   * @internal
   */
  _shouldSchedule = false
  /**
   * @internal
   */
  _depsLength = 0
  /**
   * 
   * @param fn effect 需要执行的副作用函数
   * @param trigger 一个触发器函数，用于在需要更新（例如依赖的数据发生改变）时调用（在triggerEffects函数内部调用）
   * @param scheduler 可选的调度器函数，允许自定义 effect 的执行时机。默认情况下，effect 会在依赖变化后立即执行；但如果提供了 scheduler，则会按照调度器函数指定的方式进行异步或延迟执行
   * @param scope effect作用域，可以用来管理一组相关的effect，比如在一个组件中，所有effect可能共享同一个作用域，以便于在组件销毁时同时清理这些effect。
   */
  constructor(
    public fn: () => T,
    public trigger: () => void,
    public scheduler?: EffectScheduler,
    scope?: EffectScope,
  ) {
    // 这是将当前创建的 effect 对象与提供的作用域关联起来的过程。
    // 这样，在相应的作用域生命周期结束时，能够自动清理掉在这个作用域下创建的所有 effect。
    recordEffectScope(this, scope)
  }
  /**
   * 它用于检查当前 effect 是否为“脏”状态，即其依赖的数据是否已经发生改变。
   * 这里的“脏”状态用于确定是否需要重新执行当前这个effect
   */
  public get dirty() {
    // MaybeDirty_ComputedSideEffect和MaybeDirty这两种状态表明不确定数据是否发生了变化
    if (
      this._dirtyLevel === DirtyLevels.MaybeDirty_ComputedSideEffect ||
      this._dirtyLevel === DirtyLevels.MaybeDirty
    ) {
      // _dirtyLevel设置为查询状态
      this._dirtyLevel = DirtyLevels.QueryingDirty
      // 先暂停依赖追踪
      pauseTracking()
      // 遍历所有依赖（deps）
      for (let i = 0; i < this._depsLength; i++) {
        const dep = this.deps[i]
        // 如果依赖项是计算属性（computed）
        if (dep.computed) {
          // 通过 triggerComputed函数触发该计算属性的更新
          triggerComputed(dep.computed)
          // 如果这时_dirtyLevel的值已经确认变脏了，意味着它的状态已经发生了变化，直接退出循环即可
          if (this._dirtyLevel >= DirtyLevels.Dirty) {
            break
          }
        }
      }
      // 依赖循环完毕，_dirtyLevel的值还是查询状态的话，就确定所有的依赖项都没有发生变化
      // 直接将_dirtyLevel值设置为NotDirty状态(即不需要重新执行)，
      if (this._dirtyLevel === DirtyLevels.QueryingDirty) {
        this._dirtyLevel = DirtyLevels.NotDirty
      }
      // 重新开始追踪依赖
      resetTracking()
    }
    // _dirtyLevel 是否大于等于 DirtyLevels.Dirty 的布尔值，以表明当前 effect 是否处于“脏”状态。
    // 如果返回 true，意味着这个 effect 需要被重新执行。
    return this._dirtyLevel >= DirtyLevels.Dirty
  }
  /**
   * 当参数v为true时，将当前 effect 的 _dirtyLevel 设置为 DirtyLevels.Dirty，表示该 effect 的依赖数据已发生变化，需要重新执行副作用函数.
   * 当参数v为false时，将当前 effect 的 _dirtyLevel 设置为 DirtyLevels.NotDirty，表示该 effect 的依赖数据没有变化，无需重新执行副作用函数。
   */
  public set dirty(v) {
    this._dirtyLevel = v ? DirtyLevels.Dirty : DirtyLevels.NotDirty
  }
  /**
   * 用于执行副作用函数（即在构造函数中传入的 fn 函数）
   * @returns 
   */
  run() {
    // 先将_dirtyLevel设置为NotDirty。表示该 effect 的依赖数据没有变化，无需重新执行副作用函数
    this._dirtyLevel = DirtyLevels.NotDirty
    // 如果当前这个effect是不是激活状态,如果不是表明当前这个effect已被禁用,无需追踪依赖性
    if (!this.active) {
      return this.fn() // 直接调用fn函数返回即可
    }
    // 临时变量保存当前shouldTrack值
    let lastShouldTrack = shouldTrack
    // 临时变量保存当前activeEffect值
    let lastEffect = activeEffect
    try {
      // 将shouldTrack设为true,使得在此期间需要追踪收集依赖关系
      shouldTrack = true
      // 将全局变量activeEffect执行当前ReactiveEffect对象
      activeEffect = this
      // 增加 _runnings 计数，可能是为了追踪当前effect对象的运行次数
      this._runnings++
      // 进行预清理操作
      preCleanupEffect(this)
      // 执行fn函数，这个函数中访问的所有响应式对象的属性，都会被追踪依赖，
      // 具体的可以查看proxy handler中的get trap方法，activeEffect全局变量已经指向了当前这个effect对象(记住这一段很重要)
      return this.fn()
    } finally {
      // 
      postCleanupEffect(this)
      this._runnings--
      activeEffect = lastEffect
      shouldTrack = lastShouldTrack
    }
  }

  stop() {
    if (this.active) {
      preCleanupEffect(this)
      postCleanupEffect(this)
      this.onStop?.()
      this.active = false
    }
  }
}
/**
 * 触发一个计算属性（ComputedRefImpl）的值重新计算
 * @param computed 一个计算属性对象
 * @returns 
 */
function triggerComputed(computed: ComputedRefImpl<any>) {
  // 当访问 computed.value 时，会调用ComputedRefImpl类中的get value()方法。 来确定计算属性是否发生变化并重新计算计算属性的值
  return computed.value
}
/**
 * 用于在执行副作用函数前进行预清理工作
 * @param effect 一个ReactiveEffect对象
 */
function preCleanupEffect(effect: ReactiveEffect) {
  // 每次重新执行副作用函数时，都会递增 _trackId 的值。
  // 这是因为每个 effect 在运行时会追踪并记录它所依赖的所有响应式对象，
  // 而这些依赖关系是与特定的运行周期关联的。当数据变化触发 effect 重新执行时，需要一个新的 _trackId 来标识新的执行周期，
  // 并确保能够正确地清理旧的依赖关系，然后开始收集新的依赖。
  effect._trackId++
  // 将 _depsLength 设置为 0，表示在即将开始的新一轮执行周期里，当前 effect 尚未收集任何依赖项。
  // 在执行副作用函数的过程中，会根据访问到的响应式属性自动收集依赖，随后这个变量的值将会被更新以反映实际的依赖数量
  effect._depsLength = 0
}
/**
 * postCleanupEffect是在effect中副作用函数执行后进行清理工作，主要目的是清理不再需要的依赖项。
 * 当一个 effect 在运行时追踪了新的依赖项，并且这些依赖项在下一次执行前已经失效（例如它们对应的响应式属性未被访问），那么这些无效的依赖项就需要从 effect 的依赖列表中移除。
 * @param effect 一个ReactiveEffect对象
 */
function postCleanupEffect(effect: ReactiveEffect) {
  // 检查当前 effect 的deps长度是否大于上次清理后的添加新的依赖项长度 _depsLength
  // 至于这样检查的原因在于，它新的依赖项的添加方式(请查看trackEffect函数)，因为_depsLength是0开始的，所以添加新的依赖项的索引也是重0开始的
  // 这样做的特点就是使用新的依赖项覆盖原来旧的依赖项，如果_depsLength的长度与deps.length相等，则说明deps数组中全是新的依赖项不需要执行清除操作
  if (effect.deps.length > effect._depsLength) {
    // 遍历所有依赖项
    for (let i = effect._depsLength; i < effect.deps.length; i++) {
      //调用cleanupDepEffect函数执行清除操作
      cleanupDepEffect(effect.deps[i], effect)
    }
    // 将deps的长度设置为_depsLength的值，这样数组长度发生了变化，超出length的元素将被丢弃
    effect.deps.length = effect._depsLength
  }
}
/**
 * cleanupDepEffect 函数则具体执行清理操作
 * @param dep 
 * @param effect 
 */
function cleanupDepEffect(dep: Dep, effect: ReactiveEffect) {
  // 从dep中获取effect的trackId
  const trackId = dep.get(effect)
  // 如果找到trackId，并且与当前执行周期的_trackId不相等，那就说明这个dep是旧的，需要清除
  if (trackId !== undefined && effect._trackId !== trackId) {
    // 从dep中将effect删除掉
    dep.delete(effect)
    // 并检查 dep 是否还有其他的依赖项。
    // 如果没有（即 dep.size === 0），那么调用 dep.cleanup() 来进一步清理或释放与该 dep 相关的资源。
    if (dep.size === 0) {
      dep.cleanup()
    }
  }
}

export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

export interface ReactiveEffectOptions extends DebuggerOptions {
  lazy?: boolean
  scheduler?: EffectScheduler
  scope?: EffectScope
  allowRecurse?: boolean
  onStop?: () => void
}

export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

/**
 * Registers the given function to track reactive updates.
 *
 * The given function will be run once immediately. Every time any reactive
 * property that's accessed within it gets updated, the function will run again.
 * 这个函数在被创建时会立即运行一次，然后每次在函数内部访问的任何响应式属性更新时，它都会再次运行
 * @param fn - The function that will track reactive updates.
 * @param options - Allows to control the effect's behaviour. 
 * 一个包含效果行为控制选项的对象，如 lazy（是否懒执行）、flush（调度时机）、scheduler（自定义调度器）以及 scope（作用域管理）
 * @returns A runner that can be used to control the effect after creation.
 */
export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions,
): ReactiveEffectRunner {
  // 如果传入的 fn 已经是一个 ReactiveEffectRunner，则从中提取出实际的函数
  if ((fn as ReactiveEffectRunner).effect instanceof ReactiveEffect) {
    fn = (fn as ReactiveEffectRunner).effect.fn
  }
  // 创建一个新的 ReactiveEffect 实例 _effect
  const _effect = new ReactiveEffect(fn, NOOP, () => {
    // 这里是一个scheduler 如果dirty属性为true 则为有依赖更新了需要执行fn函数
    if (_effect.dirty) {
      _effect.run()
    }
  })
  // 如果传入了options参数
  if (options) {
    // 这里的extend就是Object.assign
    extend(_effect, options)
    // 如果提供了 scope 选项，则调用 recordEffectScope 函数记录 _effect 的作用域。
    if (options.scope) recordEffectScope(_effect, options.scope)
  }
  // 如果没有提供options选项或者options.lazy(是不是懒执行，计算属性中需要用到)属性不是true则立即调用一次run函数
  if (!options || !options.lazy) {
    _effect.run()
  }
  // 将_effect.run方法调用bind使内部的this指向当前的_effect实例
  const runner = _effect.run.bind(_effect) as ReactiveEffectRunner
  // runner.effect 属性指向 当前_effect实例。
  runner.effect = _effect
  return runner
}

/**
 * Stops the effect associated with the given runner.
 * stop 函数用于停止与给定的 runner 关联的响应式（effect）。这个函数接收一个类型为 ReactiveEffectRunner 的参数，该 runner 是通过调用 effect 函数创建并返回的对象。
 * 当调用 stop(runner) 时，它会调用 runner 对象内部的 .effect.stop() 方法。
 * 这个方法的作用是终止 effect 的追踪和执行，释放与其关联的所有资源，并从响应式系统中移除对相关依赖项的监听，
 * 从而不再触发相关的副作用函数重新执行。
 * @param runner - Association with the effect to stop tracking.
 */
export function stop(runner: ReactiveEffectRunner) {
  runner.effect.stop()
}
// 表示是否应该跟踪副作用（effect）的依赖关系。默认为 true，即启用追踪。
export let shouldTrack = true
// 用于跟踪暂停调度的嵌套次数。每调用一次 pauseScheduling()，该值加 1；
// 每次调用 resetScheduling()，该值减 1。
export let pauseScheduleStack = 0

// 用于存储在调用 pauseTracking() 和 enableTracking() 时的 shouldTrack 值。
// 这样可以在调用 resetTracking() 时恢复到正确的 shouldTrack 状态。
const trackStack: boolean[] = []

/**
 * Temporarily pauses tracking.
 * 临时暂停对副作用依赖关系的追踪，将当前的 shouldTrack 值压入 trackStack，
 * 设置 shouldTrack = false
 */
export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

/**
 * Re-enables effect tracking (if it was paused).
 * 重新启用对副作用依赖关系的追踪(如果之前暂停了)，同样将当前的 shouldTrack 值压入 trackStack，
 * 并设置 shouldTrack = true
 */
export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

/**
 * Resets the previous global effect tracking state.
 * 恢复到之前的追踪状态
 */
export function resetTracking() {
  // 从 trackStack 中弹出最后一个保存的 shouldTrack 值，
  const last = trackStack.pop()
  // 并将其赋给全局的 shouldTrack 变量,如果没值则默认是true表明开启追踪依赖
  shouldTrack = last === undefined ? true : last
}
// 增加 pauseScheduleStack 的值，指示调度器暂停执行待调度的 effect
export function pauseScheduling() {
  pauseScheduleStack++
}
/**
 * 使pauseScheduleStack的值减1，并检查是否能运行queueEffectSchedulers中的调度函数
 */
export function resetScheduling() {

  pauseScheduleStack--
  // 由于pauseScheduleStack是数值，所以在使用非!操作符，只有0值才能返回true,
  // 这也是为什么将pauseScheduleStack加1就能暂停调度函数执行的原因
  while (!pauseScheduleStack && queueEffectSchedulers.length) {
    // 按照先进先出的策略，从存储数组中取出要执行调度函数
    queueEffectSchedulers.shift()!()
  }
}

/**
 * trackEffect 函数用于追踪一个effect对象对一个dep的依赖关系
 * @param effect 一个ReactiveEffect对象
 * @param dep 新建的依赖项dep
 * @param debuggerEventExtraInfo 
 */
export function trackEffect(
  effect: ReactiveEffect,
  dep: Dep,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo,
) {
  // 从依赖项dep中获取trackId与effect对象的_trackId作对比
  if (dep.get(effect) !== effect._trackId) {
    // 如果两个值不相等，说明在新的执行周期(或者effect在dep中就不存在)，需要将effect添加到依赖项dep中
    // effect为key,effect._trackId为value
    dep.set(effect, effect._trackId)
    // 在新的执行周期_depsLength从0开始的，从effect对象的deps数组中获取旧的依赖项
    const oldDep = effect.deps[effect._depsLength]
    // 如果旧的依赖不等于新的依赖
    if (oldDep !== dep) {
      // 如果oldDep不为undefined
      if (oldDep) {
        // 将旧的dep从effect的依赖项数组中清除掉
        cleanupDepEffect(oldDep, effect)
      }
      // 将新的dep替换到oldDep的位置,并且将effect._depsLength值加1
      effect.deps[effect._depsLength++] = dep
    } else {
      // 如果获取到的旧依赖和传入的dep相等(说明追踪关系已经建立)，直接将_depsLength加1即可
      effect._depsLength++
    }
    if (__DEV__) {
      effect.onTrack?.(extend({ effect }, debuggerEventExtraInfo!))
    }
  }
}
// 用于存储待调度的副作用函数（effect）调度器
const queueEffectSchedulers: EffectScheduler[] = []

/**
 * triggerEffects 函数用于触发与给定依赖项（Dep）关联的所有副作用函数（ReactiveEffect）。
 * 当 Dep 中管理的某个响应式数据发生变化时，调用此函数来重新执行相关的 effect。
 * @param dep 
 * @param dirtyLevel 
 * @param debuggerEventExtraInfo 
 */
export function triggerEffects(
  dep: Dep,
  dirtyLevel: DirtyLevels,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo,
) {
  // 首先调用 pauseScheduling() 暂停了调度，确保在处理当前依赖项变化时不会并行执行其他 effect
  pauseScheduling()
  // 从dep中获取所有的effect,进行遍历操作
  for (const effect of dep.keys()) {
    // dep.get(effect) is very expensive, we need to calculate it lazily and reuse the result
    // 通过使用一个惰性计算的变量 tracking来优化对 dep 中 effect 的 track id 的获取。由于直接调用 dep.get(effect) 方法非常昂贵（性能消耗大），尤其是在需要频繁执行的情况下，因此在这里采取了惰性计算和结果复用的方式。
    // 该变量 tracking 在初次判断时被初始化为 undefined，然后在后续条件判断中利用逻辑空赋值运算符也称为空值合并运算符??=进行惰性计算。
    // 只有当 tracking 为 undefined 时才会执行 dep.get(effect) === effect._trackId 的计算，并将结果赋值给 tracking。这样，在多次循环判断中，如果 effect 的 _trackId 对应的 track 状态未改变，则无需再次执行昂贵的 dep.get(effect) 计算操作。
    let tracking: boolean | undefined

    // 查看effect的_dirtyLevel值是否小于传入的dirtyLevel(在trigger函数调用此函数时传入的是DirtyLevels.Dirty也就是'脏'状态)
    // 并且在关联依赖与effect时的_trackId应与effect此时的_trackId值相等
    if (
      effect._dirtyLevel < dirtyLevel &&
      (tracking ??= dep.get(effect) === effect._trackId)
    ) {
      // 如果满足上述条件，则判断effect._shouldSchedule的值,当_shouldSchedule为false时，
      // 才会将effect._dirtyLevel === DirtyLevels.NotDirty赋值给effect._shouldSchedule
      effect._shouldSchedule ||= effect._dirtyLevel === DirtyLevels.NotDirty
      // 
      effect._dirtyLevel = dirtyLevel
    }
    // 如果 effect._shouldSchedule 为true 且tracking也为true
    if (
      effect._shouldSchedule &&
      (tracking ??= dep.get(effect) === effect._trackId)
    ) {
      if (__DEV__) {
        effect.onTrigger?.(extend({ effect }, debuggerEventExtraInfo))
      }
      // 调用effect的trigger函数，这个函数是创建新的ReactiveEffect对象是传入的
      effect.trigger()

      // 检查当前effect有没有正在运行
      // 或者是不是允许递归运行
      // 并且effect的_dirtyLevel的值不是DirtyLevels.MaybeDirty_ComputedSideEffect
      if (
        (!effect._runnings || effect.allowRecurse) &&
        effect._dirtyLevel !== DirtyLevels.MaybeDirty_ComputedSideEffect
      ) {
        // 将_shouldSchedule设置为false
        effect._shouldSchedule = false
        if (effect.scheduler) {
          // 如果effect有scheduler函数，则将其添加到调度队列中
          queueEffectSchedulers.push(effect.scheduler)
        }
      }
    }
  }
  // 调用 resetScheduling() 重置调度器状态
  resetScheduling()
}
