import { toRaw, toReactive, toReadonly } from './reactive'
import {
  ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
  track,
  trigger,
} from './reactiveEffect'
import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
import { capitalize, hasChanged, hasOwn, isMap, toRawType } from '@vue/shared'

type CollectionTypes = IterableCollections | WeakCollections

type IterableCollections = Map<any, any> | Set<any>
type WeakCollections = WeakMap<any, any> | WeakSet<any>
type MapTypes = Map<any, any> | WeakMap<any, any>
type SetTypes = Set<any> | WeakSet<any>

const toShallow = <T extends unknown>(value: T): T => value

const getProto = <T extends CollectionTypes>(v: T): any =>
  Reflect.getPrototypeOf(v)

function get(
  target: MapTypes,
  key: unknown,
  isReadonly = false,
  isShallow = false,
) {
  // #1772: readonly(reactive(Map)) should return readonly + reactive version
  // of the value
  // 这里的target 是代理后的值
  target = (target as any)[ReactiveFlags.RAW]
  // 这里再次toRaw的原因就是因为readonly(reactive(Map)) should return readonly + reactive 这种原因
  const rawTarget = toRaw(target)
  // 获取原始的key值
  const rawKey = toRaw(key)
  // 如果不是只读模式
  if (!isReadonly) {
    // 如果key不等于rawKey
    if (hasChanged(key, rawKey)) {
      // 则为key 调用track函数使用TrackOpTypes.GET操作类型来追踪依赖
      track(rawTarget, TrackOpTypes.GET, key)
    }
    // 为rawKey 调用track函数使用TrackOpTypes.GET操作类型来追踪依赖
    track(rawTarget, TrackOpTypes.GET, rawKey)
  }
  // 获取 rawTarget的原型对象上的has方法
  const { has } = getProto(rawTarget)
  // 根据isShallow和isReadonly的值，函数决定如何包装返回的值。如果isShallow为真，它将使用toShallow函数；
  // 如果isReadonly为真，它将使用toReadonly函数；否则，它将使用toReactive函数
  const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive
  // 使用has方法来判断rawTarget对象中是否存在key
  if (has.call(rawTarget, key)) {

    return wrap(target.get(key))
    // 使用has方法来判断rawTarget对象中是否存在rawKey
  } else if (has.call(rawTarget, rawKey)) {
    return wrap(target.get(rawKey))
    // 如果target和rawTarget不相同
  } else if (target !== rawTarget) {
    // #3602 readonly(reactive(Map))
    // ensure that the nested reactive `Map` can do tracking for itself
    // 那么函数会调用target.get(key)以确保嵌套的响应式Map可以为自己进行追踪。
    target.get(key)
  }
}

function has(this: CollectionTypes, key: unknown, isReadonly = false): boolean {

  // 分别获取原始对象和原始的属性key。和前面get函数中的原因一致
  const target = (this as any)[ReactiveFlags.RAW]
  const rawTarget = toRaw(target)
  const rawKey = toRaw(key)

  // 如果不是只读模式
  if (!isReadonly) {
    // 当key和rawKey值不相等
    if (hasChanged(key, rawKey)) {
      // 使用track函数为rawTarget对象中的key 用TrackOpTypes.HAS操作类型进行依赖追踪
      track(rawTarget, TrackOpTypes.HAS, key)
    }
    // 使用track函数为rawTarget对象中的rawKey 用TrackOpTypes.HAS操作类型进行依赖追踪
    track(rawTarget, TrackOpTypes.HAS, rawKey)
  }

  return key === rawKey
    // 如果key与rawKey相等，则使用哪个值都一样
    ? target.has(key)
    // 如果不相等，则不论哪个为true，就返回true,否则返回false
    : target.has(key) || target.has(rawKey)
}

function size(target: IterableCollections, isReadonly = false) {
  // 获取原始对象
  target = (target as any)[ReactiveFlags.RAW]
  // 如果不是只读模式，则调用 track 函数进行跟踪
  // toRaw(target) 用于将对象转换为原始形式，TrackOpTypes.ITERATE为追踪操作类型 ITERATE_KEY 则为追踪的key。
  !isReadonly && track(toRaw(target), TrackOpTypes.ITERATE, ITERATE_KEY)
  //使用Reflect.get方法获取size大小 
  // 因为size 就是一个属性值，所以可以使用Reflect.get，其他的都是方法直接使用原始对象调用对用的方法
  return Reflect.get(target, 'size', target)
}

function add(this: SetTypes, value: unknown) {
  //将value转换为原始形式的值
  value = toRaw(value)
  // 获取原始对象
  const target = toRaw(this)
  // 获取原始对象的原型
  const proto = getProto(target)
  // 调用原型上的has方法判断target中是否已经存在value值
  const hadKey = proto.has.call(target, value)
  if (!hadKey) {
    // 如果不存在，将value添加进target集合中
    target.add(value)
    // 则使用TriggerOpTypes.ADD 操作类型调用trigger函数触发副作用函数
    trigger(target, TriggerOpTypes.ADD, value, value)
  }
  return this
}
/**
 * 用于为响应式集合Map或者WeakMap添加新元素或者修改指定的值
 * @param this 代理Map或者WeakMap的对象
 * @param key 
 * @param value 
 * @returns 
 */
function set(this: MapTypes, key: unknown, value: unknown) {
  // 首先将要设置的新值 value 转换为其原始对象非代理形式
  value = toRaw(value)
  // 获取Map或WeakMap的原始对象
  const target = toRaw(this)
  // 从target原型中获取get和has方法
  const { has, get } = getProto(target)
  // 判断key是否已经在target Map中了
  let hadKey = has.call(target, key)
  // 如果不在
  if (!hadKey) {
    // 尝试获取key的原始形式值
    key = toRaw(key)
    // 再次查看key是否在target 中了
    hadKey = has.call(target, key)
  } else if (__DEV__) {
    checkIdentityKeys(target, has, key)
  }
  // 获取key对应的旧值  
  const oldValue = get.call(target, key)
  // 设置新的值
  target.set(key, value)
  if (!hadKey) {
    // 如果key之前在target对象中不存在，则使用TriggerOpTypes.ADD 操作类型调用trigger函数触发副作用函数
    trigger(target, TriggerOpTypes.ADD, key, value)
  } else if (hasChanged(value, oldValue)) {
    // 如果 key存在并且新值与旧值不同
    // 则使用TriggerOpTypes.SET 操作类型调用trigger函数触发副作用函数
    trigger(target, TriggerOpTypes.SET, key, value, oldValue)
  }
  return this
}
/**
 * 用于从响应式集合（例如 Map 或 Set）中删除指定的键值对或元素
 * @param this 集合代理对象
 * @param key 
 * @returns 
 */
function deleteEntry(this: CollectionTypes, key: unknown) {
  // 获取原始的集合对象
  const target = toRaw(this)

  // 从集合对象的原型链上获取get和has方法
  const { has, get } = getProto(target)

  // 使用has方法判断key是否已经在target中存在了
  let hadKey = has.call(target, key)
  // 如果不存在
  if (!hadKey) {
    // 尝试获取key的原始形式值
    key = toRaw(key)
    // 再次调用has方法判断是否在target中存在了
    hadKey = has.call(target, key)
  } else if (__DEV__) {
    checkIdentityKeys(target, has, key)
  }
  // 尝试获取key的值
  const oldValue = get ? get.call(target, key) : undefined
  // forward the operation before queueing reactions
  // 在原始对象上执行删除操作，并获取结果  
  // 注意：这里先执行删除操作，再触发更新通知
  const result = target.delete(key)

  if (hadKey) {
    // 如果key在target对象上存在,则使用TriggerOpTypes.DELETE 操作类型调用trigger函数触发副作用函数
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}
/**
 * 函数 clear 设计用来清除一个可迭代集合（IterableCollections）中的所有条目。
 * 这个函数通常用在响应式系统中，以确保当集合被清空时，依赖该集合的其他部分能够得到更新
 */
function clear(this: IterableCollections) {
  // 获取原始对象可能是Map或Set
  const target = toRaw(this)
  // 判断集合内是否有元素
  const hadItems = target.size !== 0
  // 在开发环境下（__DEV__ 为真），根据 target 的类型创建一个新的 Map 或 Set 对象来保存旧的集合内容
  const oldTarget = __DEV__
    ? isMap(target)
      ? new Map(target)
      : new Set(target)
    : undefined

  // forward the operation before queueing reactions
  // 在原始对象上执行清除操作，并获取结果  
  // 首先执行了对原始集合对象的 clear 操作（即 const result = target.clear()），
  // 然后才触发相应的副作用函数 (trigger) 来通知所有依赖此集合的对象或组件发生了 CLEAR 类型的操作。
  // 这样设计的好处在于可以避免在处理大量数据变更时产生过多的中间状态，提高性能，并保持视图与数据的一致性。
  const result = target.clear()

  if (hadItems) {
    // 如果之前集合不是空的，则使用TriggerOpTypes.CLEAR操作类型调用trigger函数触发副作用函数
    trigger(target, TriggerOpTypes.CLEAR, undefined, undefined, oldTarget)
  }
  return result
}
/**
 * createForEach 函数的作用是为一个可迭代集合（如Map或Set）创建一个自定义的 forEach 方法，
 * 该方法根据传入的参数 isReadonly 和 isShallow 来决定如何处理集合中的值和键。
 * @param isReadonly 当 isReadonly为true时，则为callback中的传入只读的响应对象
 * @param isShallow  当 isShallow为true时，则为callback中的传入浅响应式的值
 * 
 */
function createForEach(isReadonly: boolean, isShallow: boolean) {
  return function forEach(
    this: IterableCollections,
    callback: Function,
    thisArg?: unknown,
  ) {

    const observed = this as any
    // 获取原始对象
    const target = observed[ReactiveFlags.RAW]
    // 再次获取原始对象，因为可能存在嵌套的情况如readonly(reactive(map))
    const rawTarget = toRaw(target)
    // 根据 isShallow 和 isReadonly 的值，选择适当的包装函数（toShallow、toReadonly 或 toReactive）。
    const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive
    // 在非只读模式下，使用TrackOpTypes.ITERATE操作类型调用track函数来追踪rawTarget对象的ITERATE_KEY属性的依赖
    !isReadonly && track(rawTarget, TrackOpTypes.ITERATE, ITERATE_KEY)
    // 调用 target.forEach 方法遍历集合中的每个元素
    return target.forEach((value: unknown, key: unknown) => {
      // important: make sure the callback is
      // 1. invoked with the reactive map as `this` and 3rd arg
      // 2. the value received should be a corresponding reactive/readonly.
      // 1. 确保回调函数(callback)确保回调函数在调用时，将响应式映射作为 this 参数，并将其作为第三个参数传递。
      // 这意味着在回调函数内部，可以通过 this 来访问响应式映射的属性和方法，并且可以通过第三个参数获取到相应的元素值。
      // 2. 对于集合中的每个元素，回调函数接收的值（value）和键（key）应该被包装成相应的响应式或只读对象。
      // 这是通过调用 wrap(value) 和 wrap(key) 来实现的，其中 wrap 是根据 isReadonly 和 isShallow 参数确定的包装函数。
      // 这意味着，如果原始集合是响应式的，那么通过 forEach 方法遍历集合时，你得到的每个元素和键也应该是响应式的或只读的。
      // 这样，当这些值发生变化时，任何依赖于它们的代码都会得到通知并可以相应地更新
      return callback.call(thisArg, wrap(value), wrap(key), observed)
    })
  }
}

interface Iterable {
  [Symbol.iterator](): Iterator
}

interface Iterator {
  next(value?: any): IterationResult
}

interface IterationResult {
  value: any
  done: boolean
}
/**
 * createIterableMethod 函数用于为可迭代集合（如 Map 或 Set）创建自定义的迭代方法，
 * 比如 entries()、keys()、values() 或 Symbol.iterator 属性
 * @param method  要创建的可迭代方法的名称,如 'entries'、'keys'、'values' 或 Symbol.iterator
 * @param isReadonly 表示返回值是否应为只读的响应式对象
 * @param isShallow 表示返回值是否应为浅响应的对象
 * @returns 
 */
function createIterableMethod(
  method: string | symbol,
  isReadonly: boolean,
  isShallow: boolean,
) {
  return function (
    this: IterableCollections,
    ...args: unknown[]
  ): Iterable & Iterator {
    // 获取原始响应式对象
    const target = (this as any)[ReactiveFlags.RAW]
    //获取原始对象
    const rawTarget = toRaw(target)
    // 判断原始对象是不是Map类型
    const targetIsMap = isMap(rawTarget)
    // 用于确定是否应该返回键值对。这适用于 'entries' 方法或当使用 Symbol.iterator 并且目标是一个 Map 时。
    const isPair =
      method === 'entries' || (method === Symbol.iterator && targetIsMap)

    // 用于确定是否应该仅返回key，这适用于当目标是 Map 且方法是 'keys' 时
    const isKeyOnly = method === 'keys' && targetIsMap
    // 调用目标对象的 method 方法，并传入任何额外的参数 ...args，以获取内部迭代器 innerIterator
    const innerIterator = target[method](...args)
    // 根据 isShallow 和 isReadonly 的值选择适当的包装函数(toShallow,toReadonly,toReactive)
    const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive
    // 如果不是只读模式，使用track函数追踪原始目标的迭代操作
    !isReadonly &&
      track(
        rawTarget,
        TrackOpTypes.ITERATE,
        isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY,
      )
    // return a wrapped iterator which returns observed versions of the
    // values emitted from the real iterator
    // 
    return {
      // iterator protocol
      // 实现了迭代器协议
      next() {
        // 调用原始函数返回的实际迭代器进行包装返回
        const { value, done } = innerIterator.next()
        return done
          ? { value, done }
          : {
            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
            done,
          }
      },
      // iterable protocol
      // 简单地返回迭代器对象本身，以满足可迭代协议
      [Symbol.iterator]() {
        return this
      },
    }
  }
}
/**
 * createReadonlyMethod 创建并返回一个特定类型的只读方法。
 * 这个只读方法在被调用时不会修改原始的响应式集合，而是根据触发的操作类型返回相应的值。
 * 如果尝试在开发环境下修改只读集合，它会输出一个警告信息。
 * @param type 需要触发副作用的操作类型
 * @returns 
 */
function createReadonlyMethod(type: TriggerOpTypes): Function {
  return function (this: CollectionTypes, ...args: unknown[]) {
    if (__DEV__) {
      const key = args[0] ? `on key "${args[0]}" ` : ``
      console.warn(
        `${capitalize(type)} operation ${key}failed: target is readonly.`,
        toRaw(this),
      )
    }
    return type === TriggerOpTypes.DELETE
      ? false
      : type === TriggerOpTypes.CLEAR
        ? undefined
        : this
  }
}
/**
 * createInstrumentations 函数创建了四种不同类型的集合操作工具（instrumentations）
 * @returns 
 */
function createInstrumentations() {
  /**
   * 用于可变集合的代理方法，支持对集合进行读取、添加、设置、删除、清空以及遍历等操作。
   * 其中，get 方法调用了全局的 get 函数获取键对应的值；
   * forEach 调用了 createForEach(false, false) 创建的函数，表示在遍历时进行深度追踪和非只读处理。
   */
  const mutableInstrumentations: Record<string, Function | number> = {
    get(this: MapTypes, key: unknown) {
      return get(this, key)
    },
    get size() {
      return size(this as unknown as IterableCollections)
    },
    has,
    add,
    set,
    delete: deleteEntry,
    clear,
    forEach: createForEach(false, false),
  }
  /**
   *  类似于 mutableInstrumentations，但针对浅层可变集合，即仅追踪集合的第一层级对象的变化。get 方法中增加了额外参数表明是浅层追踪。
   */
  const shallowInstrumentations: Record<string, Function | number> = {
    get(this: MapTypes, key: unknown) {
      return get(this, key, false, true)
    },
    get size() {
      return size(this as unknown as IterableCollections)
    },
    has,
    add,
    set,
    delete: deleteEntry,
    clear,
    forEach: createForEach(false, true),
  }
  /**
   * readonlyInstrumentations: 用于只读集合的代理方法，在这里不允许执行添加、设置、删除和清空等修改集合的操作。
   * 当尝试执行这些操作时，会通过调用 createReadonlyMethod 创建的方法来抛出警告或错误。
   * 同时，get 和 size 方法会在读取时保持只读性
   */
  const readonlyInstrumentations: Record<string, Function | number> = {
    get(this: MapTypes, key: unknown) {
      return get(this, key, true)
    },
    get size() {
      return size(this as unknown as IterableCollections, true)
    },
    has(this: MapTypes, key: unknown) {
      return has.call(this, key, true)
    },
    add: createReadonlyMethod(TriggerOpTypes.ADD),
    set: createReadonlyMethod(TriggerOpTypes.SET),
    delete: createReadonlyMethod(TriggerOpTypes.DELETE),
    clear: createReadonlyMethod(TriggerOpTypes.CLEAR),
    forEach: createForEach(true, false),
  }
  /**
   * 结合了浅响应和只读性的集合代理方法，适用于那些需要只读且仅追踪集合第一层级变化的情况。
   * 其操作限制与 readonlyInstrumentations 相同，但在 get 方法中也包含了浅层追踪的特性
   */
  const shallowReadonlyInstrumentations: Record<string, Function | number> = {
    get(this: MapTypes, key: unknown) {
      return get(this, key, true, true)
    },
    get size() {
      return size(this as unknown as IterableCollections, true)
    },
    has(this: MapTypes, key: unknown) {
      return has.call(this, key, true)
    },
    add: createReadonlyMethod(TriggerOpTypes.ADD),
    set: createReadonlyMethod(TriggerOpTypes.SET),
    delete: createReadonlyMethod(TriggerOpTypes.DELETE),
    clear: createReadonlyMethod(TriggerOpTypes.CLEAR),
    forEach: createForEach(true, true),
  }

  const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator]
  /**
   * 为四种不同类型的集合代理（mutable、readonly、shallow、shallowReadonly）添加了迭代器方法，
   * 包括 'keys'、'values'、'entries' 以及 Symbol.iterator。
   */
  iteratorMethods.forEach(method => {
    mutableInstrumentations[method as string] = createIterableMethod(
      method,
      false,
      false,
    )
    readonlyInstrumentations[method as string] = createIterableMethod(
      method,
      true,
      false,
    )
    shallowInstrumentations[method as string] = createIterableMethod(
      method,
      false,
      true,
    )
    shallowReadonlyInstrumentations[method as string] = createIterableMethod(
      method,
      true,
      true,
    )
  })

  return [
    mutableInstrumentations,
    readonlyInstrumentations,
    shallowInstrumentations,
    shallowReadonlyInstrumentations,
  ]
}

const [
  mutableInstrumentations,
  readonlyInstrumentations,
  shallowInstrumentations,
  shallowReadonlyInstrumentations,
] = /* #__PURE__*/ createInstrumentations()

/**
 * createInstrumentationGetter 函数用于创建一个 getter 函数，
 * 这个 getter 函数将根据给定的 isReadonly 和 shallow 参数来决定如何处理对目标集合属性的访问
 * @param isReadonly 表示是否只读
 * @param shallow 表示是否是浅响应
 * @returns 
 */
function createInstrumentationGetter(isReadonly: boolean, shallow: boolean) {
  // 根据isReadonly和shallow 来选择合适的集合的代理方法
  const instrumentations = shallow
    ? isReadonly
      ? shallowReadonlyInstrumentations
      : shallowInstrumentations
    : isReadonly
      ? readonlyInstrumentations
      : mutableInstrumentations

  // 这个返回函数对应的就是Proxy Handler的get trap函数
  return (
    target: CollectionTypes,
    key: string | symbol,
    receiver: CollectionTypes,
  ) => {
    // 根据其一系列内部使用的标志，返回相应的值
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (key === ReactiveFlags.RAW) {
      return target
    }

    return Reflect.get(
      // 判断key是否在选择的代理集合方法中,而且 key 也的在target集合中
      hasOwn(instrumentations, key) && key in target
        ? instrumentations // 如果前面条件为true ，则返回代理集合方法
        : target,// 否则使用target对象
      key,
      receiver,
    )
  }
}

/**
 * 用于可变集合代理处理器（Proxy Handler），可以对集合进行添加，修改，删除等操作
 */
export const mutableCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: /*#__PURE__*/ createInstrumentationGetter(false, false),
}
/**
 * 这个处理器与 mutableCollectionHandlers 类似，但它是针对浅层响应式的。
 *  这意味着它仅追踪并相应集合的第一层元素的变化，深层嵌套的对象属性将不会被转换为响应式
 */
export const shallowCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: /*#__PURE__*/ createInstrumentationGetter(false, true),
}
/**
 *  这是为只读集合设计的代理处理器（Proxy Handler），它会阻止对目标集合的任何修改操作，
 *  但允许从集合中获取数据，这样可以保证对象的不可变性。
 */
export const readonlyCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: /*#__PURE__*/ createInstrumentationGetter(true, false),
}
/**
 * 它提供了对集合只读访问，而不支持深层次的响应式跟踪。
 */
export const shallowReadonlyCollectionHandlers: ProxyHandler<CollectionTypes> =
{
  get: /*#__PURE__*/ createInstrumentationGetter(true, true),
}

function checkIdentityKeys(
  target: CollectionTypes,
  has: (key: unknown) => boolean,
  key: unknown,
) {
  const rawKey = toRaw(key)
  if (rawKey !== key && has.call(target, rawKey)) {
    const type = toRawType(target)
    console.warn(
      `Reactive ${type} contains both the raw and reactive ` +
      `versions of the same object${type === `Map` ? ` as keys` : ``}, ` +
      `which can lead to inconsistencies. ` +
      `Avoid differentiating between the raw and reactive versions ` +
      `of an object and only use the reactive version if possible.`,
    )
  }
}
