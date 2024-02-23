import {
  type Target,
  isReadonly,
  isShallow,
  reactive,
  reactiveMap,
  readonly,
  readonlyMap,
  shallowReactiveMap,
  shallowReadonlyMap,
  toRaw,
} from './reactive'
import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
import {
  pauseScheduling,
  pauseTracking,
  resetScheduling,
  resetTracking,
} from './effect'
import { ITERATE_KEY, track, trigger } from './reactiveEffect'
import {
  hasChanged,
  hasOwn,
  isArray,
  isIntegerKey,
  isObject,
  isSymbol,
  makeMap,
} from '@vue/shared'
import { isRef } from './ref'
import { warn } from './warning'

// 
/**
 * isNonTrackableKeys 是一个通过 makeMap 函数生成的函数，用于判断给定的键名是否为非追踪（non-trackable）键
 * 这里的 \_\_proto\_\_, __v_isRef, 和 __isVue__ 是指定的非追踪键。
 * 例如，在处理对象属性变更时，如果遇到这些特殊的键，Vue不会将它们添加到依赖追踪系统中，以避免不必要的计算和更新操作。
 */
const isNonTrackableKeys = /*#__PURE__*/ makeMap(`__proto__,__v_isRef,__isVue`)

/**
 * builtInSymbols用于存储JavaScript内置Symbol类型的所有内建属性值。这些内建的 Symbol 类型属性通常不会直接在应用中使用，
 * 但它们是 JavaScript 引擎内部定义的特殊符号，例如 Symbol.iterator、Symbol.hasInstance 等
 */
const builtInSymbols = new Set(
  /*#__PURE__*/
  Object.getOwnPropertyNames(Symbol)
    // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
    // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
    // function
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => (Symbol as any)[key])
    .filter(isSymbol),
)
/**
 * 创建了一个arrayInstrumentations对象，它包含了一些被"instrumentation"过的数组方法。
 * /*#__PURE__*/ /*注释，它告诉一些工具（如 terser)这个函数是纯函数，它的返回值只依赖于它的输入参数，并且不产生任何可观察的副作用.
* 在tree-shaking时如果没有使用可以放心删除
*/
const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations()

function createArrayInstrumentations() {
  // 创建一个空对象 instrumentations，键值对为 <string, Function> 类型
  // 包含对数组原生方法的重写（instrumentation）。这些重写的方法主要用于处理响应式数据中的数组操作，
  // 确保在修改数组时能够正确地追踪依赖和调度更新。
  const instrumentations: Record<string, Function> = {}
    // instrument identity-sensitive Array methods to account for possible reactive
    // values
    // 数组方法如 includes、indexOf、lastIndexOf 是使用严格相等性检查（===）来确定数组中是否包含某个元素。
    // 如果数组中的元素是响应式对象，并且这些对象的在内存中的位置发生了变化（即使它们的内容没有变化），这些方法可能会返回不同的结果。
    // 为了正确处理这种情况，我们需要对这些方法进行改造（或“增强”），以确保它们能够正确地追踪和响应数据的变化。
    ; (['includes', 'indexOf', 'lastIndexOf'] as const).forEach(key => {
      // 参数this 是TypeScript 提供了一种显式声明 this 类型的方式，在转换为JavaScript时会去除
      instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
        // 获取原始的数组对象
        const arr = toRaw(this) as any
        // 然后遍历数组，对每个元素调用 track 函数来跟踪其访问。
        // 这样做是为了确保在调用这几个方法时，能够追踪到任何可能的响应值。
        for (let i = 0, l = this.length; i < l; i++) {
          // 调用 track 函数来对数组的每个索引进行追踪依赖，TrackOpTypes.GET是一个枚举值，指示我们正在追踪一个“获取”操作
          track(arr, TrackOpTypes.GET, i + '')
        }
        // we run the method using the original args first (which may be reactive)
        // 首先直接使用参数args(参数可能是响应式的对象)传给相应的函数执行
        const res = arr[key](...args)
        if (res === -1 || res === false) {
          // if that didn't work, run it again using raw values.
          // 如果直接使用args查找不到，就使用toRaw函数获取原始对象值传递给相应的方法执行
          // 这样可以确保即使参数是嵌套的响应式对象也能正确地计算和比较其值，从而得到预期的结果。
          return arr[key](...args.map(toRaw))
        } else {
          // 这里就是找到了，直接返回对应的值
          return res
        }
      }
    })
    // instrument length-altering mutation methods to avoid length being tracked
    // which leads to infinite loops in some cases (#2137)
    // 下面这几个方法会造成数组length的变化，如果不进行处理，可能会导致依赖追踪时的无限循环问题
    ; (['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {

      instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
        // 暂停依赖追踪
        pauseTracking()
        // 暂停副作用调度
        pauseScheduling()
        // 调用相应的数组方法执行
        const res = (toRaw(this) as any)[key].apply(this, args)
        // 重置调度
        resetScheduling()
        // 重置追踪
        resetTracking()
        // 返回数组方法的值
        return res
      }
    })
  return instrumentations
}
/**
 * 该函数用于检查一个对象是否拥有某个属性，并且在这个过程中还进行了依赖追踪
 * @param key 表示要检查的属性名
 * @returns 
 */
function hasOwnProperty(this: object, key: string) {
  // 获取原始对象
  const obj = toRaw(this)
  // 调用 track 函数来追踪依赖这通常意味着当 obj 是一个响应式对象时
  // 该函数会记录当前有一个依赖正在检查 obj 是否拥有 key 这个属性。
  // TrackOpTypes.HAS 是一个枚举值，用于指示这个追踪操作是检查对象是否拥有某个属性。
  track(obj, TrackOpTypes.HAS, key)
  // 调用原生的 Object.hasOwnProperty 方法来检查原始对象上是否存在指定的 key 属性。
  return obj.hasOwnProperty(key)
}
/**
 * BaseReactiveHandler 是一个实现了 ProxyHandler<Target> 接口的类，主要用于处理响应式对象的代理行为
 */
class BaseReactiveHandler implements ProxyHandler<Target> {
  /**
   * 
   * @param _isReadonly {Boolean} 表示是否为只读模式，如果是，则在获取属性时会返回相应的只读信息或确保返回的值不会被直接修改。
   * @param _shallow {Boolean}  表示是否为浅层代理，如果是，则只对目标对象的第一层属性进行响应式处理
   */
  constructor(
    protected readonly _isReadonly = false,
    protected readonly _shallow = false,
  ) { }
  /**
   * 在 JavaScript 的 Proxy 对象中，handler.get() 方法是一个陷阱（trap）函数，用于拦截对目标对象（target object）属性的访问。这个陷阱函数对应的是内部方法 [[Get]]，
   * 该内部方法通常由诸如属性访问器（property accessors，如 obj.prop 或 obj['prop']）之类的操作触发
   * @param target 这是被代理的目标对象
   * @param key 这是要访问的属性的名称（通常是一个字符串）或 Symbol。它表示你正在尝试获取的目标对象的属性的键。
   * @param receiver  这是接收操作的代理对象或继承自代理对象的某个对象。在大多数情况下，receiver 和 target 是相同的，但是在某些链式操作中，receiver 可能是代理对象的一个原型对象
   * @returns 
   */
  get(target: Target, key: string | symbol, receiver: object) {
    const isReadonly = this._isReadonly,
      shallow = this._shallow
    // 首先检查键名（key），如果请求的是特定的元信息标识符（如 ReactiveFlags.IS_REACTIVE、ReactiveFlags.IS_READONLY、ReactiveFlags.IS_SHALLOW、ReactiveFlags.RAW），则直接返回对应的状态。
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (key === ReactiveFlags.IS_SHALLOW) {
      return shallow
    } else if (key === ReactiveFlags.RAW) {
      if (
        receiver ===
        // 根据是不是只读和浅响应来获取已经创建好的代理对象
        (isReadonly
          ? shallow
            ? shallowReadonlyMap
            : readonlyMap
          : shallow
            ? shallowReactiveMap
            : reactiveMap
        ).get(target) ||
        // receiver is not the reactive proxy, but has the same prototype
        // this means the reciever is a user proxy of the reactive proxy
        /**
         * 通常，receiver 和 target 是相同的，特别是在直接对代理对象进行操作时。然而，在某些情况下，特别是在涉及到原型链上的属性访问时，receiver 可能会和 target 不同。
         * 当你尝试访问一个对象原型链上的属性时，JavaScript 会沿着原型链向上查找该属性。如果找到一个 Proxy 对象，它会触发该 Proxy 的 handler.get() 陷阱。
         * 在这种情况下，receiver 将是触发这个属性访问的原始对象（即，调用链中实际的对象），而 target 是 Proxy 对象。
         * 因此，当receiver 是触发属性访问的原始对象，而这个对象并没有通过 Proxy 进行封装。
         * 同时，receiver 和 target（即代理对象）有相同的原型，这意味着它们共享相同的原型链。
         * ```
         */
        Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
      ) {
        return target
      }
      // early return undefined
      return
    }
    // 如果target 是数组类型
    const targetIsArray = isArray(target)
    // 在非只读模式下
    if (!isReadonly) {
      // 如果是数组并且指定的方法key重写了
      if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
        // 获取arrayInstrumentations中被重写的指定的key方法
        return Reflect.get(arrayInstrumentations, key, receiver)
      }
      // 如果请求的键是 hasOwnProperty，则直接返回 hasOwnProperty 函数，而不是从目标对象上获取它
      if (key === 'hasOwnProperty') {

        return hasOwnProperty
      }
    }
    // 使用 Reflect.get 方法从目标对象上获取属性key的值
    const res = Reflect.get(target, key, receiver)
    // 如果请求的键是内置的Symbol或不可追踪的键，则直接返回属性的值。
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res
    }

    if (!isReadonly) {
      // 如果创建的代理对象不是只读的 使用 track 函数追踪该属性的依赖
      track(target, TrackOpTypes.GET, key)
    }
    // 如果创建的代理对象是浅响应式的，则直接返回属性的值，不进行深层响应式处理。
    if (shallow) {
      return res
    }
    // 如果属性的值是一个引用（Ref），则进行解包操作，返回其内部值。对于数组和整数键，不进行解包。
    if (isRef(res)) {
      // ref unwrapping - skip unwrap for Array + integer key.
      return targetIsArray && isIntegerKey(key) ? res : res.value
    }
    // 在这里进行isObject检查是为了避免无效值的警告。这是因为只有当返回的值是一个对象时，才能安全地将其转换为一个代理对象。
    // 如果返回的值不是一个对象（例如，它是一个基本类型如数字、字符串或布尔值），那么尝试将其转换为一个代理对象将会导致错误或警告。
    // 如果属性的值是一个对象，则将其转换为响应式对象或只读对象
    if (isObject(res)) {
      // Convert returned value into a proxy as well. we do the isObject check
      // here to avoid invalid value warning. Also need to lazy access readonly
      // and reactive here to avoid circular dependency.
      // 这句话提到需要延迟访问readonly和reactive，以避免循环依赖。
      // 在编程中，循环依赖是指两个或多个对象或模块相互依赖，形成一个闭环，这可能导致程序无法正常运行。
      // 在这种情况下，readonly和reactive可能是一些函数或属性，它们在被访问时可能会触发其他代码的执行，这些代码可能又依赖于当前正在执行的代码，从而形成循环依赖。
      // 为了避免这种情况，需要延迟访问这些属性，直到确实需要它们为止。
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
  }
}
/**
 * MutableReactiveHandler 类是Vue 3响应式系统中处理可变（mutable）响应式对象的处理器类，就是支持获取、修改、增加、删除等
 * 这个类主要负责对响应式对象属性进行设置、删除、查询和迭代操作，并确保这些操作能够触发相应的依赖追踪和更新通知。
 * @extends BaseReactiveHandler
 *    
 */
class MutableReactiveHandler extends BaseReactiveHandler {
  /**
   *@param shallow 表示是否为浅层代理，如果是，则只对目标对象的第一层属性进行响应式处理
   */
  constructor(shallow = false) {
    // 调用父类构造函数 super(false, shallow) 初始化响应式处理器。
    // 只读模式为false, shallow为传入的值
    super(false, shallow)
  }
/**
 * Proxy 对象的set trap（陷阱）方法。这个方法允许你拦截和自定义对象属性的设置操作。
 * @param target 这是被代理的对象，也就是拦截其操作的原始对象
 * @param key 属性的名称，可以是一个字符串或者一个 Symbol
 * @param value 设置的新值
 * @param receiver 这是接收赋值操作的对象。在大多数情况下，这个对象会是代理对象本身。但是，如果赋值操作是通过原型链或者其他方式间接地进行的，那么 receiver 可能会是原型链上的某个对象
 * @returns {Boolean} 返回 true 代表属性设置成功。 在严格模式下，如果 set() 方法返回 false，那么会抛出一个 TypeError 异常。
 */
  set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object,
  ): boolean {
    // 通过原始对象获取对应key的旧值
    let oldValue = (target as any)[key]
    // 在非shallow下
    if (!this._shallow) {
      // 如果原值是一个引用类型（如 Ref 对象），且新值不是引用类型，则直接修改原值的 .value 属性
      // 判断旧值是不是只读的
      const isOldValueReadonly = isReadonly(oldValue)
      // 如果新的值不是shalldow和readonly的下将新旧值分别转为原始对象值
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue)
        value = toRaw(value)
      }
      // 如果原始对象不是数组，且旧值(oldValue)是ref类型但新值(value)不是ref类型
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        if (isOldValueReadonly) {
          // 如果旧值是只读的，直接返回false，不修改
          return false
        } else {
          // 否则直接重新赋值
          oldValue.value = value
          return true
        }
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
      // 当设置一个处于浅层代理的对象属性时，无论该属性是原始对象还是其他响应式对象，都会直接将给定的值赋给目标属性，而不会创建深层的响应式代理或进行任何依赖追踪。
    }

    // 检查属性是否存在
    const hadKey =
    // 如果是数组且key是整数 返回key值是不是一个有效的索引
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        // 否则使用Object.prototype.hasOwnProperty.call(target,key)判断target对象中是否存在key属性
        : hasOwn(target, key)
        // 使用Reflect.set设置新的属性值
    const result = Reflect.set(target, key, value, receiver)

    // don't trigger if target is something up in the prototype chain of original
    //检查当前的目标对象（target）是否就是receiver代理的对象(即new Proxy(target)的对象)。
    // 如果set操作是在原始对象的原型链上发生的，而不是在其自身上(例如设置的属性是原型链上的属性)，那么我们不希望触发任何响应式更新或通知
    // 因为这可能导致不必要的更新或者递归循环问题
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        // 元素对象上没有指定的key,说明要原件新属性 使用trigger函数触发TriggerOpTypes.ADD类型的通知
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        // 存在key 且新值(value)和旧值(oldValue)不相等,则调用trigger方法触发TriggerOpTypes.SET类型的通知
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }

  /**
   * deleteProperty trap允许你拦截对代理对象属性的删除操作。当你尝试通过代理对象删除一个属性时，deleteProperty trap 会被调用
   * @param target  原始对象
   * @param key 待删除的属性名
   * @returns {Boolean} 返回一个 Boolean 类型的值,表示了该属性是否被成功删除
   */
  deleteProperty(target: object, key: string | symbol): boolean {
    // target对象上是否在key
    const hadKey = hasOwn(target, key)
    // 获取属性值
    const oldValue = (target as any)[key]
    //  调用Reflect.deleteProperty函数执行删除操作，删除指定key
    const result = Reflect.deleteProperty(target, key)
    // 如果删除成功且target存在key属性
    if (result && hadKey) {
      // 调用trigger方法触发TriggerOpTypes.DELETE类型的通知
      trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
    }
    return result
  }
/**
 * has trap 函数，它允许你拦截对代理对象属性存在性的检查操作。
 * 当你使用 in 操作符来检查一个属性是否存在于对象中时，has trap 会被调用
 * @param target 原始对象
 * @param key 要检查其存在性的属性的名称或 Symbol
 * @returns {Boolean} 表示属性是否存在于对象中。如果返回 true，则 in 操作符会返回 true，表示属性存在；如果返回 false，则 in 操作符会返回 false，表示属性不存在。
 */
  has(target: object, key: string | symbol): boolean {
    // 调用Reflect.has方法指定判断操作
    const result = Reflect.has(target, key)
    // 如果key不是Symbol类型或不是内置的Symbol
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      // 则调用track函数追踪target对象的key属性的依赖，使用TrackOpTypes.HAS类型
      track(target, TrackOpTypes.HAS, key)
    }
    return result
  }
  /**
   * ownKeys trap函数，会在诸如 Object.keys()、Object.getOwnPropertyNames()、Object.getOwnPropertySymbols() 以及 Reflect.ownKeys() 这些操作时调用
   * @example
   * ```js
   * const obj = {
   *     a: 1,
   *     b: "1",
   *     [Symbol('owns')]: {},
   *  }
   *  const proxyObj = new Proxy(obj, {
   *       ownKeys(target) {
   *           console.log("ownKeys is trigger");
   *           return Reflect.ownKeys(target);
   *       }
   *   })
   *
   *  console.log(Object.getOwnPropertyNames(proxyObj));
   *  console.log(Object.getOwnPropertySymbols(proxyObj));
   *  console.log(Object.keys(proxyObj));
   *  console.log(Reflect.ownKeys(proxyObj));
   * ```
   * @param target 原始对象
   * @returns 
   */
  ownKeys(target: object): (string | symbol)[] {
    // 用于追踪对象的迭代操作，所以使用TrackOpTypes.ITERATE类型
    track(
      target,
      TrackOpTypes.ITERATE,
      // 如果 target 是数组类型，则追踪其 length 属性；
      // 否则追踪一个预设的常量 ITERATE_KEY (在生产环境为Symbol(""))
      isArray(target) ? 'length' : ITERATE_KEY,
    )
    // 调用Reflect.ownKeys方法并返回
    return Reflect.ownKeys(target)
  }
}

/**
 * 创建一个只读的响应式代理处理程序。
 * @extends BaseReactiveHandler 
 */
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(shallow = false) {
    // true 代表创建只读的代理对象
    super(true, shallow)
  }
/**
 * 因为是只读的所以不能进行set操作
 * @param target 
 * @param key 
 * @returns 
 */
  set(target: object, key: string | symbol) {
    if (__DEV__) {
      warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }
// 也不能进行删除操作
  deleteProperty(target: object, key: string | symbol) {
    if (__DEV__) {
      warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }
}
// 这是一个针对可变对象的代理处理器（Proxy Handler），它可能封装了一系列方法来实现对目标对象属性的读取、设置和删除等操作的拦截，
// 并确保这些操作能够触发相应的依赖更新，以保持数据响应性
export const mutableHandlers: ProxyHandler<object> =
  /*#__PURE__*/ new MutableReactiveHandler()

  // 这是为只读对象设计的代理处理器（Proxy Handler），它会阻止对目标对象属性的任何修改操作，
  // 但允许读取属性值，这样可以保证对象的不可变性。
export const readonlyHandlers: ProxyHandler<object> =
  /*#__PURE__*/ new ReadonlyReactiveHandler()

  // 这个处理器与 mutableHandlers 类似，但它是针对浅层响应式的。
  // 这意味着它仅追踪并响应对象的第一层属性变化，深层嵌套的对象属性将不会被转换为响应式
export const shallowReactiveHandlers = /*#__PURE__*/ new MutableReactiveHandler(
  true,
)

// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
// 特殊的 props handlers（属性处理器）被设计为在保持对象的响应性的同时，不自动解包顶层的 ref
// 类似于 readonlyHandlers，但同样应用于浅层对象。
// 它提供了对对象第一层级属性的只读访问，而不支持深层次的响应式跟踪。
export const shallowReadonlyHandlers =
  /*#__PURE__*/ new ReadonlyReactiveHandler(true)
