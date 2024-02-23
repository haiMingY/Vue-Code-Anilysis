import { isArray, isIntegerKey, isMap, isSymbol } from '@vue/shared'
import { DirtyLevels, type TrackOpTypes, TriggerOpTypes } from './constants'
import { type Dep, createDep } from './dep'
import {
  activeEffect,
  pauseScheduling,
  resetScheduling,
  shouldTrack,
  trackEffect,
  triggerEffects,
} from './effect'

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Maps to reduce memory overhead.
/**
 * targetMap它存储的结构就是 {target -> key -> dep}这样，
 * target 是被观察的对象，
 * key 是该对象上的属性键，
 * 而 dep 是一个依赖项，它存储了所有依赖于该 target[key] 的effect。
 * 这样设计的目标是为了高效地存储和查找特定对象上的响应式依赖关系
 * 
 * 从概念上讲，我们可以将依赖项视为一个 Dep 类，该类维护了一个订阅者的集合。
 * 但为了减少内存开销，我们简单地将它们存储为Map类型。
 * 
 * 而WeakMap 的特点是不会阻止垃圾回收，这样js引擎可以自动清理不再被引用的键值对，从而避免内存泄漏。
 */
type KeyToDepMap = Map<any, Dep>
const targetMap = new WeakMap<object, KeyToDepMap>()
// 这两个常量分别代表迭代器的符号键。它们在处理可迭代对象（如数组）和 Map 中的键迭代时使用，
// 以识别和跟踪这些特殊场景下的依赖。在开发环境下，它们还带有调试信息以便于开发者更好地理解内部机制
export const ITERATE_KEY = Symbol(__DEV__ ? 'iterate' : '')
export const MAP_KEY_ITERATE_KEY = Symbol(__DEV__ ? 'Map key iterate' : '')

/**
 * Tracks access to a reactive property.
 *
 * This will check which effect is running at the moment and record it as dep
 * which records all effects that depend on the reactive property.
 * track 函数在 Vue3 的响应式系统中扮演着核心角色，它负责追踪对响应式属性的访问。
 * 当一个 effect 正在运行并尝试访问某个对象的响应式属性时，该函数会被调用。
 * @param target - Object holding the reactive property.
 * @param type - Defines the type of access to the reactive property.
 * @param key - Identifier of the reactive property to track.
 */
export function track(target: object, type: TrackOpTypes, key: unknown) {
  // 先使用shouldTrack判断是否应该进行依赖追踪
  // 使用activeEffect变量判断当前是否有正在运行中的effect
  // 两则都为true时，进入下一步
  if (shouldTrack && activeEffect) {
    // 使用target 原始对象作为键从targetMap中获取depsMap
    let depsMap = targetMap.get(target)
    // 如果不存在
    if (!depsMap) {
      // 创建一个新的Map赋值给depsMap，并添加到targetMap中
      targetMap.set(target, (depsMap = new Map()))
    }
    // 从depsMap中获取key的依赖项
    let dep = depsMap.get(key)
    // 如过key还没有依赖项，则创建新的并添加到depsMap中
    if (!dep) {
      // createDep函数用于创建新的依赖项，并传入一个函数，当这个依赖项不在需要时，执行清理操作
      depsMap.set(key, (dep = createDep(() => depsMap!.delete(key))))
    }
    // 调用trackEffect函数将activeEffect值和dep值传入
    trackEffect(
      activeEffect,
      dep,
      __DEV__
        ? {
            target,
            type,
            key,
          }
        : void 0,
    )
  }
}

/**
 * Finds all deps associated with the target (or a specific property) and
 * triggers the effects stored within.
 * trigger 函数在 Vue3 的响应式系统中扮演着核心角色，它的主要职责是根据给定的目标对象（通常是被代理的或观测过的对象）
 * 和操作类型来触发与该目标相关的依赖（Dep），进而运行这些依赖中存储的所有副作用函数（effect）
 * @param target - The reactive object.
 *  一个响应式对象
 * @param type - Defines the type of the operation that needs to trigger effects. 
 *  操作类型，取值为 TriggerOpTypes 枚举类型的成员，表示需要触发效果的操作类型，如 SET、ADD、DELETE 或 CLEAR 等。
 * @param key - Can be used to target a specific reactive property in the target object.可用于在目标对象中的一个响应式属性
 * @param newValue 新值 
 * @param oldValue 旧值 
 * @param oldTarget 
 */
export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>,
) {
  // 获取target对象的所有依赖
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    // 如果没值，那就表明没有建立起依赖关系，直接退出
    return
  }

  let deps: (Dep | undefined)[] = []
  // 如果是清除(clear都清空了)操作那么久触发target的所有依赖
  if (type === TriggerOpTypes.CLEAR) {
    // collection being cleared
    // trigger all effects for target
    deps = [...depsMap.values()]
  } else if (key === 'length' && isArray(target)) {
    // 如果是设置数组length的操作
    const newLength = Number(newValue)
    depsMap.forEach((dep, key) => {
      // 从depsMap中获取length属性的相关的依赖项
      // 还有超过新长度的旧索引的依赖项
      if (key === 'length' || (!isSymbol(key) && key >= newLength)) {
        deps.push(dep)
      }
    })
  } else {
    // schedule runs for SET | ADD | DELETE
    // 下面将对应SET | ADD | DELETE这三种操作，选择依赖项

    // 如果key不是undefined
    if (key !== void 0) {
      // 则将获取到的key的依赖项添加到deps数组中
      deps.push(depsMap.get(key))
    }

    // also run for iteration key on ADD | DELETE | Map.SET
    // 同样需要特别处理迭代键 在ADD DELETE Map.Set等操作时
    switch (type) {
      // 添加操作
      case TriggerOpTypes.ADD:
        if (!isArray(target)) {
          // 如果不是数组类型,需触发ITERATE_KEY的依赖项
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            // 如果是Map类型,则需触发MAP_KEY_ITERATE_KEY的依赖项
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        } else if (isIntegerKey(key)) {
          // 如果是key是整数，则是向数组添加新索引，则数组长度会变化，需要触发length依赖项
          // new index added to array -> length changes
          deps.push(depsMap.get('length'))
        }
        break
      case TriggerOpTypes.DELETE:
        if (!isArray(target)) {
          // 如果不是数组，则触发ITERATE_KEY的依赖项 
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            // 如果是 Map，则还触发MAP_KEY_ITERATE_KEY依赖项 
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        }
        break
      case TriggerOpTypes.SET:
        if (isMap(target)) {
          // 如果是更新 Map 的键值对，则触发ITERATE_KEY依赖项
          deps.push(depsMap.get(ITERATE_KEY))
        }
        break
    }
  }
// 先暂停调度器
  pauseScheduling()
  // 遍历所有相关的依赖项
  for (const dep of deps) {
    if (dep) {
      // 如果依赖项存在则调用triggerEffect函数
      triggerEffects(
        dep,
        DirtyLevels.Dirty, // 默认使用DirtyLevels.Dirty,表示需要重新运行effect重新计算或更新视图
        __DEV__
          ? {
              target,
              type,
              key,
              newValue,
              oldValue,
              oldTarget,
            }
          : void 0,
      )
    }
  }
  // 重置调度器，恢复正常的调度流程。这样就可以继续处理其他的变更事件，并按顺序依次执行对应的调度函数
  resetScheduling()
}
/**
 * 从给定的object和属性键key获取对应的依赖收集器Dep。
 * 这个函数通过全局 targetMap 来查找关联的依赖关系
 * @param object 
 * @param key 
 * @returns 
 */
export function getDepFromReactive(object: any, key: string | number | symbol) {
  return targetMap.get(object)?.get(key)
}
