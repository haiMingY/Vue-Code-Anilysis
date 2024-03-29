# reactivity

`@vue/reactivity` 是 Vue3 中用于实现响应式系统的核心库。这个库提供了创建和管理响应式数据的能力，是Vue组件状态管理和自动更新视图的基础。

本文使用的vue版本为v3.4.16

## **简介与背景**

Vue.js框架的响应式系统是其核心特性之一，它决定了框架能够自动追踪并根据数据变化更新用户界面的能力。在传统的Web开发中，开发者需要手动管理状态和视图之间的同步，而Vue.js通过其独特的响应式机制极大地简化了这一过程。

响应式系统的重要性体现在：
1. 数据驱动视图：Vue.js中的组件状态（data）和DOM（Document Object Model）之间建立了一种紧密联系。当数据发生变化时，Vue会自动地、高效地更新相关的DOM元素，实现了数据驱动视图（Data Binding）的核心理念。
2. 开发效率提升：由于无需手动处理DOM操作，开发者可以更专注于业务逻辑的实现，大大提高了开发效率，降低了出错的可能性。
3. 性能优化：Vue响应式系统内部包含了一套复杂的依赖收集和派发更新算法，确保只有真正影响到视图的数据变化才会触发渲染，从而避免不必要的DOM操作，提高应用程序性能。

Vue3对响应式系统的重构背景：
Vue2使用`Object.defineProperty()`方法来实现对象属性的getter/setter，以达到响应式的目的。然而，这种方法存在一些限制，例如无法直接监听数组的变化，以及对于深层次嵌套的对象属性修改，需要深度遍历等开销。

Vue3针对以上问题进行了全面升级，引入了ES6的Proxy API作为新的响应式基础，构建了全新的`@vue/reactivity`库。这个库不仅用于Vue3框架内部，还作为一个独立模块发布，具备良好的封装性和可复用性。这意味着其他JavaScript项目也能利用Vue3的响应式系统实现数据绑定功能，增强了代码的灵活性和模块化程度。

`@vue/reactivity`库的核心作用在于提供了创建和管理响应式对象的方法，如`reactive()`用于创建响应式对象，`ref()`用于创建基本类型值的响应式引用，同时还包含了计算属性、观察者模式等高级API，使得数据层的抽象更为清晰且易于维护。通过这样的设计，Vue3响应式系统在保持易用性的同时，显著提升了性能，并且更好地适应了现代JavaScript特性的演进趋势。

## 什么是响应式

响应式编程是一种编程范式，它侧重于数据流和变化传播的管理。在响应式系统中，程序不是基于指令式的“执行一系列操作”，而是定义数据之间的依赖关系，当数据发生变化时，所有依赖该数据的部分都会自动地、异步地更新。这种模式使得应用程序能够更自然地应对事件驱动和实时的数据环境。而在Vue.js框架中，指的是数据和视图之间的自动同步机制。当应用中的状态发生变化时，依赖这些状态的视图能够立即、自动地更新到最新状态，无需手动操作DOM。

**响应式编程的核心概念包括：**

1. **数据流与变更通知**：响应式系统中的数据被视为流动的数据流。当数据源发生更改时，系统会自动向订阅了这些数据的组件或函数发送通知。
2. **依赖收集与追踪**：系统会在运行时动态地收集和追踪对数据的访问，以确定哪些部分关心特定数据的变化。
3. **声明式编程风格**：通过定义状态如何影响视图或其他状态，而非具体如何修改它们，使得代码更易于理解和维护。
4. **可观察对象（Observable）与订阅者（Subscriber）**：响应式编程中通常存在可观察对象（如RxJS中的Observable），它们可以发出一系列值，并且有订阅者来接收这些值并作出反应。



一个简单的示例：

```javascript
const text = document.querySelector("#text");
// 定义全局的activeEffect变量，用于保存当前正在运行的effect
let activeEffect;
/**
 * @type {WeakMap<Object,Map<String,Set<Effect>>>}
 * 保存每一个属性依赖的Effect
 * */
const targetMap = new WeakMap();

function reactive(proxyTarget) {
    const proxyObj = new Proxy(proxyTarget, {
        get(target, key, receiver) {
            const res = Reflect.get(target, key, receiver);
            track(target, key);
            return res;

        },
        set(target, key, value, receiver) {
            const res = Reflect.set(target, key, value, receiver);
            trigger(target, key);
            return res;

        }
    })
    return proxyObj;
}
// 收集
function track(target, key) {
    if (!activeEffect) return;
    if (!targetMap.has(target)) {
        targetMap.set(target, new Map())
    }
    let map = targetMap.get(target);
    if (map.has(key)) {
        map.get(key).add(activeEffect);
    } else {
        map.set(key, new Set([activeEffect]))
    }

}
// 触发
function trigger(target, key) {
    const map = targetMap.get(target);
    map?.get(key)?.forEach((effect) => {
        effect.run()
    })
}
// 创建一个Effect类来模拟副作用函数
class Effect {
    constructor(fn) {
        this.fn = fn;
        this.run()
    }

    run() {
        let lastEffect = activeEffect;
        activeEffect = this;
        const reuslt = this.fn()
        activeEffect = lastEffect;
        return reuslt;
    }
}

const tom = reactive({ age: 45, count: 10 });
const max = reactive({ age: 30 });

const effect = new Effect(() => {
    text.innerHTML = `tom年龄：${tom.age},max年龄：${max.age}`;
    console.log(tom.count);
})
setInterval(() => {
    tom.age++
    max.age++
    tom.count++
}, 2000);
```

这是一个很简单的例子，但和vue中的实现很类似，但没有像vue那样实现的复杂和健壮。但是对于理解vue核心的响应式原理有一定的帮助。

![reactive](reactive.jpg)

- 首先使用reactive函数使用proxy代理源对象，并利用get和set来进行劫持数据、

- 创建Effect对象，传入一个函数fn，就是使用这个函数自动追踪其依赖项。每当这些依赖项发生变化时，该函数会立即重新运行。

  - 在构造函数中，我们会调用run 方法，在这个方法中会将activeEffect全局变量指向当前的Effect对象。并运行传入的函数(这一步很重要，如果没有我们便无法完成依赖收集)，在这个函数中我们会使用tom和max代理对象获取age属性和count属性，这样就会触发这个三个属性的get 函数,

  - 在get 函数中除了使用Reflect.get获取target对象上的值，还使用track函数来收集依赖，将当前的effect对象由activeEffect全局变量保存关联到当前的属性上

    > WeakMap可以使用对象作为键，这样我们使用target对象作为键，使用Map作为值，在这个Map中在使用key值保存当前属性依赖的effect对象
    >
    > 使用Set的原因就是为了防止重复收集依赖

- 当依赖收集步骤完成后，在setInterval使用时，调用tom.age++，会先触发get函数，但当前没有activeEffect值，所以就直接退出了。然后将原值加1触发set函数。

    - 先使用Reflect.set方法将新值设置到源对象上
    - 调用trigger函数，在targetMap中根据传入的target对象和key值获取依赖，并执行。

- 到此，已成闭环，我们只需更改数据，就可以自动获取更改后的值。



## 核心API

### reactive()

`reactive()`是Vue3响应式系统中的一个核心函数，用于创建一个对象的响应式代理。当你调用`reactive(target)`时，它会返回一个新的代理对象，这个代理对象与原始对象具有相同的结构，但它是可响应式的，当对象内部属性发生改变时，所有依赖这些数据变化的视图将自动更新。

```javascript
import { reactive, effect } from "@vue/reactivity"
const obj = reactive({ value: 0 });
effect(() => {
    console.log(obj.value);
})
obj.value++

```

#### 特点

**深度响应化**：当调用 `reactive({ count: 0 ，nested:{ value:6 }})` 时，不仅顶层的 `count` 属性会变得响应式，如果该对象包含嵌套对象或数组，那么这些嵌套结构的所有层级也将被转化为响应式。

```javascript
import { reactive, effect } from "@vue/reactivity"

const obj = reactive({ count: 0, nested: { value: 6 } })
effect(() => {
    console.log(obj.count);
    console.log(obj.nested.value);
})

obj.count++
obj.nested.value++
```

**Ref解包**：如果在响应式对象中遇到 `ref` 类型的属性，Vue会自动解包（unwrap）它，也就是说访问该属性时相当于直接访问 `.value`

```javascript
import { ref, reactive } from '@vue/reactivity';

const count = ref(1);
const obj = reactive({ count });

console.log(obj.count === count.value); // true
```

例外情况：在访问作为数组或原生集合类型（如Map）元素的 `ref` 时，不会进行自动解包。此时仍需通过 `.value` 来获取实际值

```javascript
import { ref, reactive } from '@vue/reactivity';

const books = reactive([ref('Hello')]);
console.log(books[0].value); // 需要 .value 获取包裹在 ref 中的值

const map = reactive(new Map([['count', ref(0)]]));
console.log(map.get('count').value); // 同样需要 .value 获取值
```

### ref()

`ref()`函数也是Vue3响应式系统中的核心API，它用于将任意类型的值封装在一个深度响应式的、可变的引用对象中。这个引用对象有一个`.value`属性，指向内部的原始值。

```javascript
import { ref, effect } from '@vue/reactivity';

const num = ref(0)
const user = ref({ age: 25 });
effect(() => {
    console.log(num.value);
    console.log(user.value.age)
})
num.value++;
user.value = { age: 54 }
```

### computed()

`computed()`函数在Vue3响应式系统中用于创建计算属性，它基于一个获取器函数（getter）来返回一个只读或可写的响应式引用对象.计算属性的特点在于，当其依赖的数据发生变化时，会自动触发计算并更新结果

```
// 只读计算属性
function computed<T>(
  getter: (oldValue: T | undefined) => T,
  debuggerOptions?: DebuggerOptions
): Readonly<Ref<Readonly<T>>>

// 可写计算属性
function computed<T>(
  options: {
    get: (oldValue: T | undefined) => T
    set: (value: T) => void
  },
  debuggerOptions?: DebuggerOptions
): Ref<T>
```

**只读计算属性**：

```javascript
import { computed, effect, ref } from '@vue/reactivity';

const num = ref(0)
const computedNum = computed(() => num.value * 2)
effect(() => {
    console.log(computedNum.value)
})
num.value++
num.value++
```

**可写计算属性**：

```javascript
import { computed, effect, ref } from '@vue/reactivity';

const num = ref(0)
const computedNum = computed({
    get() { return num.value },
    set(v) {
        num.value = v
    }
})
effect(() => {
    console.log(computedNum.value)
})
num.value++
num.value++
computedNum.value++
```

在开发过程中，我们可以通过`debuggerOptions`参数来设置断点以调试计算属性的生命周期行为：

- `onTrack`: 当计算属性被追踪依赖（即有地方开始读取该计算属性的值）时，调用`debugger`暂停代码执行。
- `onTrigger`: 当计算属性因为依赖变化而重新求值时，调用`debugger`暂停代码执行。

```
computed(() => num.value + 1, {
  onTrack(debuggerEvent) {
    debugger;
  },
  onTrigger(debuggerEvent) {
    debugger;
  }
});
```

### watch()

`watch()`函数用于监听一个或多个响应式数据源的变化，并在这些数据发生变化时执行回调函数。它提供了对组件状态变化的细粒度控制和灵活处理。

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

通过`watch()`函数，开发者能够更精确地管理组件的状态更新逻辑，根据特定状态变化执行相应的操作，比如在网络请求、状态同步等方面提供便利。

### readonly()

`readonly()`函数是Vue3响应式系统中提供的一个工具函数，它用于将对象（无论是原始的普通对象还是已经通过`reactive()`函数创建的响应式对象）或ref转换为只读代理。

```
import { reactive, readonly, ref } from '@vue/reactivity';

const user = reactive({ name: 'Tom', age: ref(25) });
const readonlyUser = readonly(user);
// 直接修改失败 发出warn警告
readonlyUser.name = '李四';
readonlyUser.age = 30; 
console.log(readonlyUser.name) //Tom
console.log(readonlyUser.age) // 25
```

### **watchEffect()**

`watchEffect()`函数是Vue3响应式系统中的一个重要API，它用于立即运行一个函数，并在该函数执行过程中追踪其依赖项。每当这些依赖项发生变化时，该函数将会重新运行。

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
  - 返回值是一个停止句柄函数，调用它可以停止该效应函数再次运行。

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

`watch`和`watchEffect`都是Vue3中用于响应式执行副作用的函数，但它们在跟踪依赖的方式上有主要区别：

1. **watch：**
   - `watch`仅跟踪显式指定的观察源。也就是说，它不会追踪回调函数内部访问到的所有响应式属性。
   - 回调函数只有当所观察的数据源实际发生变化时才会触发。
   - 使用`watch`时，开发者可以明确地指出要监听哪些数据源的变化来执行相应的副作用，提供了更精确的控制回调触发时机的能力。
2. **watchEffect：**
   - `watchEffect`将依赖跟踪和副作用执行合并为一个阶段。在同步执行过程中，它会自动跟踪所有访问过的响应式属性作为依赖项。
   - 这种方式编写代码更为简洁方便，无需明确指明每一个依赖关系，但同时意味着它的响应式依赖关系不如`watch`那样显式清晰。

总结来说，`watch`适用于那些需要精准控制何时基于特定状态变化执行副作用的情况；而`watchEffect`则更适合于需要根据当前所有相关响应式状态变化立即执行副作用，并且不需要特别关注具体哪个状态发生改变的情况。

## 内部机制剖析

### 常量或枚举类型

```typescript

/**

TrackOpTypes 是一个枚举类型，它定义了在 Vue 3 的响应式系统中追踪数据访问和操作的不同类型。
这些操作类型用于标记和追踪当读取或访问响应式对象的属性时发生的行为，以便 Vue 能够正确地追踪依赖关系并优化性能。
 */
export enum TrackOpTypes {

  // 当访问或读取响应式对象的属性时，用于追踪 getter 操作。
  // 这意味着当你读取一个响应式对象的属性时，Vue 会追踪这个操作，以便知道哪些计算属性或侦听器依赖于这个属性的值。
  // 这样，如果将来这个属性的值发生变化，Vue 可以准确地知道哪些部分需要重新计算和更新。
  GET = 'get', 

// 在检查响应式对象是否包含特定键时，用于追踪 has 操作。例如 obj.hasOwnProperty(key) 或 key in obj等
  HAS = 'has', 

  // 在遍历响应式集合（如数组、Map、Set）时，用于追踪迭代操作。
  // 这包括使用 for...of 循环、forEach 方法或其他迭代方法访问集合元素
  ITERATE = 'iterate', 
}
/**
 TriggerOpTypes 枚举定义了需要触发副作用的操作类型。
 在 Vue 的响应式系统中，当数据发生变化时， 需要有一种方式来通知所有依赖于这些数据的变化的部分，
 以便它们可以相应地更新或重新计算。TriggerOpTypes 提供了这种通知机制所需的操作类型。
 */
    
export enum TriggerOpTypes {
  //表示设置响应式对象属性值的操作。当响应式对象的某个属性被赋值时，会触发此操作。
  // 这会进一步触发 setter 函数，通知所有依赖于该属性变化的计算属性和侦听器，以便它们可以重新计算和/或更新
  SET = 'set', 

  // 在响应式集合（如数组、Map、Set 等）中添加新元素的操作。当向这些集合类型添加新元素时，会触发 ADD 操作。
  // 这允许 Vue 跟踪集合的变化，并相应地更新依赖于这些集合的计算属性和侦听器。
  ADD = 'add',
   
  // 从响应式集合中删除元素的操作。当集合中的元素被移除时，会触发 DELETE 操作。
  // 这告诉 Vue 集合已发生变化，需要更新依赖于该集合的计算属性和侦听器
  DELETE = 'delete',

  // 清空整个响应式集合的操作。当集合被清空时（例如，数组被设置为空数组，或 Map/Set 被清空），会触发 CLEAR 操作。
  // 这会导致所有依赖于该集合的计算属性和侦听器被重新计算和/或更新。
  CLEAR = 'clear',
}
/**
ReactiveFlags 枚举定义了一系列内部使用的标志，这些标志用于标记和追踪响应式对象的状态。
这些标志通常作为对象的隐藏属性存在，以便 Vue 内部能够识别并相应地处理这些对象
 */
export enum ReactiveFlags {
  // 用于标记一个对象是否应该跳过响应式处理。在某些情况下，Vue 可能需要处理一个对象，但又不希望将其转换为响应式对象
  SKIP = '__v_skip',

  // 表示一个对象是否是响应式对象。
  // 当对象被 Vue 的 reactive() ref的value是对象，shallowReactive(),readonly()参数是前面三种情况处理时，
  IS_REACTIVE = '__v_isReactive',

  IS_READONLY = '__v_isReadonly',// 表示一个对象是否是只读响应式对象

  //表示一个对象是否是浅层响应式对象。当使用 shallow* 函数创建对象时，这个标志会被设置。浅层响应式对象只有其顶层属性是响应式的，嵌套的对象则保持原样，不会被递归地转换为响应式对象
  IS_SHALLOW = '__v_isShallow', 

  RAW = '__v_raw', //存储原始非代理的对象引用，以便在需要时直接访问原始数据，而不是通过代理对象。。
}

// DirtyLevels 枚举用于内部追踪对象的脏状态（dirty state）。这种脏检查机制是 Vue 用来确定何时重新计算和更新视图的关键部分。
// 当你修改一个响应式对象时，Vue 需要知道这个变化，并据此决定是否要重新渲染组件。
export enum DirtyLevels {
  // 表示对象目前没有被修改过，即它的状态是“干净”的。
  NotDirty = 0,

  // 当 Vue 需要检查一个对象是否可能变脏时，会设置这个状态。这通常发生在 Vue 评估计算属性或侦听器依赖项时，需要确定是否重新执行这些函数
  QueryingDirty = 1,

  // 当 Vue 需要检查一个对象是否可能变脏时，会设置这个状态。这通常发生在 Vue 评估计算属性或侦听器依赖项时，需要确定是否重新执行这些函数
  MaybeDirty_ComputedSideEffect = 2,

  // 表示对象可能发生了某种不确定的变化，但还没有足够的信息来确定这种变化是否真正影响了视图。这通常是一个中间状态，用于在进一步调查之前暂时标记对象。
  MaybeDirty = 3,

  // 对象已被确认变脏了，意味着它的状态已经发生了变化，并且这些变化需要被处理以更新视图。一旦对象被标记为 Dirty，Vue 就会触发相关的副作用函数（如计算属性或侦听器），并更新视图
  Dirty = 4,
}

```



### reactive函数的实现

我们现在以reactive函数的实现为切入口，看一下@vue/reactive内部的实现机制

源码：

```typescript
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



// reactiveMap 是一个全局的 WeakMap 对象。它用于存储已经被转换为响应式的对象
const reactiveMap = new WeakMap<Target, any>()

export function reactive(target) {
  // 首先检查目标对象是否已经是一个只读代理对象(就是使用readonly()创建的)。如果是，则直接返回该对象，因为无需再次进行响应式转换
  if (isReadonly(target)) {
    return target
  }
  // 否则调用createReactiveObject函数创建一个新的响应式代理对象
  return createReactiveObject(
    target,  
    false, 
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap, 
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

```

### ProxyHandler

在 Proxy 对象中，你可以定义一系列的处理器函数（Handler functions），这些函数也被称为陷阱（traps），因为它们可以拦截对目标对象的操作。当执行与 Proxy 相关的方法时，实际会调用这些处理器函数而不是直接操作目标对象。在vue中则为不同类型的代理对象提供了不同的`ProxyHandler`实现

#### BaseReactiveHandler

`BaseReactiveHandler` 是一个实现了 `ProxyHandler<Target>` 接口的类，主要用于处理响应式对象的代理行为。这个类根据传入的 `_isReadonly` 和 `_shallow` 参数来决定代理的行为是只读还是浅响应的。

```typescript
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
```

#### MutableReactiveHandler

 MutableReactiveHandler 类继承了BaseReactiveHandler是用于处理可变（mutable）响应式对象的处理器类，就是支持获取、修改、增加、删除等

```typescript
/**
 * MutableReactiveHandler 类是Vue 3响应式系统中处理可变（mutable）响应式对象的处理器类，就是支持获取、修改、增加、删除等
 * 这个类主要负责对响应式对象属性进行设置、删除、查询和迭代操作，并确保这些操作能够触发相应的依赖追踪和更新通知。
 * @extends BaseReactiveHandler
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

```

#### ReadonlyReactiveHandler

ReadonlyReactiveHandler类继承了BaseReactiveHandler类，用于创建只读的响应式代理处理程序。

```typescript

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
 * 因为是只读的所以不能进行赋值操作
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

```

#### baseHandlers 参数的取值

```typescript
// 这是一个针对可变对象的代理处理器（Proxy Handler），它可能封装了一系列方法来实现对目标对象属性的读取、设置和删除等操作的拦截，
// 并确保这些操作能够触发相应的依赖更新，以保持数据响应性
export const mutableHandlers: ProxyHandler<object> =
  /*#__PURE__*/ new MutableReactiveHandler()

  // 这是为只读对象设计的代理处理器（Proxy Handler），它会阻止对目标对象属性的任何修改操作，
  // 但允许读取属性值，这样可以保证对象的不可变性。
export const readonlyHandlers: ProxyHandler<object> =
  /*#__PURE__*/ new ReadonlyReactiveHandler()

  // 这个处理器与 mutableHandlers 类似，但它是针对浅层响应式的。
  // 这意味着它仅追踪并反应对象的第一层属性变化，深层嵌套的对象属性将不会被转换为响应式
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

```



#### collectionHandlers

当我们代理集合类型(如Map,Set,WeakMap,WeakSet)时，并不能和代理对象和数组一样，应为集合类型对应的基本都是方法和一个size只读属性，所以当我们使用proxy.add(),proxy.get(),proxy.set()等方法时都会只触发代理的get Handler trap函数。

例如：

```javascript
const obj = new Map()
// 创建一个Symbol，用于表示代理的元素值属性
const raw = Symbol("_raw_")
// 用于获取代理的原始对象的函数
const toRaw = (target) => target[raw];
// 创建代理对象
const proxyObj = new Proxy(obj, {
    get(target, key, receiver) {
        console.log("get:", target, key);
        // 当key值和 raw值一致时，返回原始对象
        if (key === raw) return target;
        // 这时我们调用Reflect.get函数时，就不能使用target作为参数，否则会出错
        return Reflect.get({
            // 当我们调用set 函数时，最终会调用这个函数
            set(key, value) {
                // 获取原始对象，并调用原始的Map对象的set方法完成操作
                const target = toRaw(this);
                return target.set(key, value)
            },
            // 当我们使用proxyObj获取size时，就会调用这个getter
            get size() {
                return toRaw(this).size;
            }
        }, key, receiver);
    }
})

proxyObj.set("key", "value");
console.log(proxyObj.size);//1
```

这个是一个简单的代理Map集合的例子，如果能够理解这个例子，对于理解Vue中对于代理集合的处理有一定的帮助。

```typescript
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
 * 它提供了对集合只读访问，而且不支持深层次的响应式跟踪。
 */
export const shallowReadonlyCollectionHandlers: ProxyHandler<CollectionTypes> =
{
  get: /*#__PURE__*/ createInstrumentationGetter(true, true),
}
```

### Dep类型

```typescript
/**
 * Dep类型定义:
 * 它是一个联合类型，表示一个 Map 结构，其中键是 ReactiveEffect 对象，值为ReactiveEffect 对象的_trackId属性值，并且扩展了一些额外属性。
 * 
 */
export type Dep = Map<ReactiveEffect, number> & {
  /**
   * cleanup 这是一个清理方法，当依赖关系不再需要时执行
   * @example
   * ```javascript
   *  depsMap.set(key, (dep = createDep(() => depsMap!.delete(key))))
   * ```
   * 在track函数中,就是定义cleanup函数来从depsMap中将当前key删除掉
   * @returns 
   */
  cleanup: () => void
  /**
   * 可选的计算属性实例(ComputedRefImpl对象)，如果该 Dep 是由计算属性产生的，则会指向对应的计算属性实例
   */
  computed?: ComputedRefImpl<any>
}
/**
 * createDep 用于创建一个Dep
 * @param cleanup 清理函数，在不需要这个 Dep 时调用以释放资源
 * @param computed 计算属性实例(ComputedRefImpl对象)，将它与新建的 Dep 关联起来
 * @returns 
 */
export const createDep = (
  cleanup: () => void,
  computed?: ComputedRefImpl<any>,
): Dep => {
  const dep = new Map() as Dep
  dep.cleanup = cleanup
  dep.computed = computed
  return dep
}
```



### **effect**函数的实现

`effect` 函数是 Vue3 中响应式系统的核心之一，它用于注册一个函数以追踪并响应数据的变化。这个函数在被创建时会立即运行一次，然后每次在函数内部访问的任何响应式属性更新时，它都会再次运行

下面是关于effect函数相关的源码分析

```typescript
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

```



### EffectScope类

在 Vue3 的响应式系统中，`EffectScope` 是一个用于管理一组相关effect的作用域。它提供了一种方法来组织和控制effect的生命周期，使得多个effect可以作为一个整体进行创建、运行和清理。

下面是有关EffectScope类和Scope相关的方法的源码分析

```typescript

// 全局变量，它在 Vue3 的响应式系统中用于跟踪当前活动的效果作用域（EffectScope）。
// 在执行某个副作用函数（effect）时，Vue 会将当前正在运行的 EffectScope 设置为全局的 activeEffectScope
let activeEffectScope: EffectScope | undefined
/**
 * EffectScope 类是 Vue3 响应式系统中管理一组相关 effect（副作用函数）的作用域。
 * 它主要负责收集和控制这些 effect 的执行、清理以及在作用域结束时自动停止所有关联的 effect。
 */
export class EffectScope {
  /**
   * @internal
   * 表示该作用域是否处于活动状态，
   */
  private _active = true
  /**
   * @internal
   * 存储当前作用域下所有的 ReactiveEffect 实例
   */
  effects: ReactiveEffect[] = []
  /**
   * @internal
   * 存储当作用域结束时需要执行的清理函数
   */
  cleanups: (() => void)[] = []

  /**
   * only assigned by undetached scope
   * 用于构建效果作用域层级关系，当创建一个新的非独立作用域时，它的 parent 属性会被设置为其父级作用域实例
   * @internal
   */
  parent: EffectScope | undefined
  /**
   * record undetached scopes
   * 记录非独立的的子作用域列表
   * @internal
   */
  scopes: EffectScope[] | undefined
  /**
   * track a child scope's index in its parent's scopes array for optimized
   * removal
   * 该属性记录了当前作用域在其父级作用域的子作用域列表（scopes 数组）中的索引位置。同样，只有在创建非独立作用域时，
   * Vue 会将新创建的作用域添加到其父级作用域的子作用域列表，并为此新创建的作用域设置正确的索引值
   * @internal
   */
  private index: number | undefined

  /**
   * 
   * @param detached 参数 detached，默认为 false，表示此作用域是否独立于父级作用域。如果不是独立作用域，则会将自身添加到父级作用域的 scopes 列表中，并设置其索引值。
   */
  constructor(public detached = false) {
    // 将当前全局变量保存的EffectScope实例设置为其parent属性
    this.parent = activeEffectScope
    if (!detached && activeEffectScope) {
      // 非独立和存在activeEffectScope时，将当前新创建的EffectScope添加到父作用域的scopes属性中
      this.index =
        (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this,
        ) - 1
    }
  }
  // 获取当前作用域状态
  get active() {
    return this._active
  }
/**
 * 
 * @param fn 一个需要执行的函数
 * @returns 
 */
  run<T>(fn: () => T): T | undefined {
    // 如果当前作用域为活跃状态
    if (this._active) {
      // 使用变量currentEffectScope保存全局activeEffectScope的值
      const currentEffectScope = activeEffectScope
      try {
        // 使全局activeEffectScope指向当前的EffectScope实例
        activeEffectScope = this
        // 执行fn函数
        return fn()
      } finally {
        // 重新将全局activeEffectScope值重置为fn运行之前的值currentEffectScope 
        activeEffectScope = currentEffectScope
      }
    } else if (__DEV__) {
      warn(`cannot run an inactive effect scope.`)
    }
  }

  /**
   * This should only be called on non-detached scopes
   * 仅能被非独立作用域调用，使全局变量activeEffectScope 指向当前EffectScope实例对象
   * @internal
   */
  on() {
    activeEffectScope = this
  }

  /**
   * This should only be called on non-detached scopes
   * 仅能被非独立作用域调用，使全局变量activeEffectScope 指向当前EffectScope实例的父作用域
   * @internal
   */
  off() {
    activeEffectScope = this.parent
  }
/**
 * 停止当前作用域及其所有子作用域，并执行所有清理函数
 * @param fromParent 是不是来自父作用域清理调用
 */
  stop(fromParent?: boolean) {
    // 如果当前effectScope实例是活跃的，即还没有被stop过，才执行清理操作
    if (this._active) {
      let i, l
      // 停止所有effect
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop()
      }
      // 执行所有cleanup函数，这些函数通常用于释放资源或执行其他必要的清理任务。
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]()
      }
      // 停止并清理所有嵌套的作用域
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true)
        }
      }
      // nested scope, dereference from parent to avoid memory 
      // 当嵌套的作用域不再需要时，应该从其父作用域中解除对它的引用，以避免内存泄漏。
      // 非独立作用域且存在其父作用域而且fromParent为false
      if (!this.detached && this.parent && !fromParent) {
        // optimized O(1) removal
        // 移除作用域数组中的最后一个scope(虽然会改变原数组的length,但不会改变其他元素的索引位置)
        const last = this.parent.scopes!.pop()
        if (last && last !== this) { // 如过last不为undefined，且不是当的这个作用域(如果是当前的这个就没必要执行下面的操作了，因为就已经移除了)
          // 将last替换到当前作用域在scopes数组的位置
          this.parent.scopes![this.index!] = last
          // 将last的索引更改为当前scope的索引位置，删除完毕
          last.index = this.index!
        }
      }
      this.parent = undefined
      // 表明该作用域已经停止活跃
      this._active = false
    }
  }
}

/**
 * Creates an effect scope object which can capture the reactive effects (i.e.
 * computed and watchers) created within it so that these effects can be
 * disposed together. For detailed use cases of this API, please consult its
 * corresponding {@link https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md | RFC}.
 * 用于创建一个新的EffectScope实例。这个作用域可以捕获在其内部创建的所有响应式effects(例如computed和watchers），
 * 从而可以一次性地一起处理（例如停止或清理）这些effect。
 * @param detached - 当 detached 为 true 时，创建的效果作用域将不会自动附加到当前的活动作用域(activeEffectScope)上，而是保持独立。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#effectscope}
 */
export function effectScope(detached?: boolean) {
  return new EffectScope(detached)
}
/**
 * 这个函数用于将一个ReactiveEffect对象记录到一个给定的EffectScope对象中。
 * @param effect 一个ReactiveEffect实例
 * @param scope 一个EffectScope实例，如果未提供，默认为activeEffectScope的值
 */
export function recordEffectScope(
  effect: ReactiveEffect,
  scope: EffectScope | undefined = activeEffectScope,
) {
  // 如果scope值不为undefined且scope是活跃的
  if (scope && scope.active) {
    // 将effect对象添加到scope的effects数组中
    scope.effects.push(effect)
  }
}

/**
 * Returns the current active effect scope if there is one.
 * 获取当前活跃的effect scope
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#getcurrentscope}
 */
export function getCurrentScope() {
  return activeEffectScope
}

/**
 * Registers a dispose callback on the current active effect scope. The
 * callback will be invoked when the associated effect scope is stopped.
 * 用于在当前活动EffectScope对象上注册一个清理回调函数（fn）。
 * 当这个EffectScope对象被停止时，这个回调函数会被调用。
 * @param fn - The callback function to attach to the scope's cleanup.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#onscopedispose}
 */
export function onScopeDispose(fn: () => void) {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn)
  } else if (__DEV__) { // 如果在调用时activeEffectScope为undefined则在开发环境发出警告
    warn(
      `onScopeDispose() is called when there is no active effect scope` +
        ` to be associated with.`,
    )
  }
}

```

### track()和trigger()

在 Vue3 的响应式系统中`track` 和 `trigger` 是两个关键函数，它们共同构成了依赖追踪和更新通知的核心机制。

**track 函数**

- 当在一个 effect（副作用函数）中访问一个响应式对象的属性时，Vue3 通过 Proxy 对象捕获到这个访问操作。
- `track` 函数负责将当前正在运行的 effect，并将其与被访问的响应式属性关联起来。它会将 effect 添加到该属性对应的 Dep（依赖收集器）中，从而建立起 effect 与数据之间的依赖关系。

**trigger 函数**

- 当响应式对象的某个属性值发生改变时，Vue3 通过代理设置拦截器触发 `trigger` 函数。
- `trigger` 函数根据已建立的依赖关系，找到所有依赖于该属性变更的 effect，并调用这些 effect 的 `run` 方法来重新计算结果并通知更新视图。

下面是这两个函数的源码分析

```typescript

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

```

总结来说，`track` 负责在读取阶段收集依赖，而 `trigger` 在写入阶段负责通知相关 effect 执行更新。这两个函数配合工作，实现了 Vue3 中自动化的响应式更新流程。



### computed计算属性的实现

```typescript
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
```

### ref类型的实现

```typescript
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
```

## 总结

Vue3 的响应式系统是一个基于 ES6 Proxy API 构建的高度优化和灵活的数据绑定机制，确保当数据发生变化时，所有依赖于这些数据的视图或计算属性能够自动更新。以下是 Vue3 响应式系统的详细工作原理：

1. **Proxy 代理**：
   - Vue3 使用 Proxy 对象替代了 Vue2 中的 Object.defineProperty，为数据对象创建一个代理实例。
   - 当访问（get）或修改（set）代理对象的属性时，Proxy 可以拦截这些操作，并在背后执行自定义逻辑。

2. **Reactive/Ref 创建响应式对象**：
   - `reactive` 函数用于将普通 JavaScript 对象转换为深度响应式的对象。它通过递归遍历原对象的所有属性并为其创建 Proxy，使得任何层级的属性变更都能被追踪。
   - `ref` 函数则用于包装基本类型值，生成一个带有 `.value` 属性的 Ref 对象，该对象同样具有响应性。

3. **依赖收集（Track）**：
   - 在执行副作用函数（如渲染组件、计算属性计算等）的过程中，会调用 `track` 函数来记录当前运行的副作用及其所依赖的响应式属性。
   - `track` 函数会查找与被访问属性关联的 Dep（依赖收集器），并将当前活跃的副作用添加到 Dep 中。

4. **变更通知（Trigger）**：
   - 当响应式对象的属性发生改变时，对应的 set 操作会被 Proxy 拦截并触发 `trigger` 函数。
   - `trigger` 函数会根据收集到的依赖信息，遍历并重新执行所有依赖于这个属性变更的副作用函数，从而实现视图或其他相关状态的更新。

5. **Dep 和 EffectScope**：
   - Dep 是一个存储依赖关系的数据结构，其中包含了一组影响该响应式属性变化的副作用函数集合。
   - EffectScope 则是管理一组相关副作用作用域的类，可以批量暂停、恢复或者清理这一作用域内的所有副作用。

6. **Computed Ref**：
   - 计算属性由 `computed` 函数创建，返回的是 ComputedRef 类型的对象，其内部使用 `ReactiveEffect` 实现依赖追踪和结果缓存。
   - 当计算属性的依赖项发生变化时，会自动重新计算，并触发相应的视图更新。

7. **Track/Trigger API 细节**：
   - `track` 方法会判断是否应该进行依赖收集，仅在 `shouldTrack` 标志为真且存在活跃副作用时才执行。
   - `trigger` 方法会根据 dirty 状态决定如何触发依赖，包括 DirtyLevels.Dirty、DirtyLevels.MaybeDirty 和 DirtyLevels.MaybeDirty_ComputedSideEffect 不同级别的更新。

8. **性能优化措施**：
   - Vue3 进行了一系列性能优化，如避免不必要的依赖收集，通过 effect.scheduler 批量调度更新，以及利用 Scheduling 避免过度渲染等问题。

通过以上设计，Vue3 的响应式系统不仅提高了代码的可读性和可维护性，还极大地提升了性能，实现了高效、准确的数据绑定及视图更新。
