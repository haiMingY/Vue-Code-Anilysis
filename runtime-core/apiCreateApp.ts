import {
  type Component,
  type ComponentInternalInstance,
  type ConcreteComponent,
  type Data,
  getExposeProxy,
  validateComponentName,
} from './component'
import type {
  ComponentOptions,
  MergedComponentOptions,
  RuntimeCompilerOptions,
} from './componentOptions'
import type {
  ComponentCustomProperties,
  ComponentPublicInstance,
} from './componentPublicInstance'
import { type Directive, validateDirectiveName } from './directives'
import type { ElementNamespace, RootRenderFunction } from './renderer'
import type { InjectionKey } from './apiInject'
import { warn } from './warning'
import { type VNode, cloneVNode, createVNode } from './vnode'
import type { RootHydrateFunction } from './hydration'
import { devtoolsInitApp, devtoolsUnmountApp } from './devtools'
import { NO, extend, isFunction, isObject } from '@vue/shared'
import { installAppCompatProperties } from './compat/global'
import type { NormalizedPropsOptions } from './componentProps'
import type { ObjectEmitsOptions } from './componentEmits'
import type { DefineComponent } from './apiDefineComponent'

export interface App<HostElement = any> {
  version: string
  config: AppConfig

  use<Options extends unknown[]>(
    plugin: Plugin<Options>,
    ...options: Options
  ): this
  use<Options>(plugin: Plugin<Options>, options: Options): this

  mixin(mixin: ComponentOptions): this
  component(name: string): Component | undefined
  component(name: string, component: Component | DefineComponent): this
  directive<T = any, V = any>(name: string): Directive<T, V> | undefined
  directive<T = any, V = any>(name: string, directive: Directive<T, V>): this
  mount(
    rootContainer: HostElement | string,
    isHydrate?: boolean,
    namespace?: boolean | ElementNamespace,
  ): ComponentPublicInstance
  unmount(): void
  provide<T>(key: InjectionKey<T> | string, value: T): this

  /**
   * Runs a function with the app as active instance. This allows using of `inject()` within the function to get access
   * to variables provided via `app.provide()`.
   *
   * @param fn - function to run with the app as active instance
   */
  runWithContext<T>(fn: () => T): T

  // internal, but we need to expose these for the server-renderer and devtools
  _uid: number
  _component: ConcreteComponent
  _props: Data | null
  _container: HostElement | null
  _context: AppContext
  _instance: ComponentInternalInstance | null

  /**
   * v2 compat only
   */
  filter?(name: string): Function | undefined
  filter?(name: string, filter: Function): this

  /**
   * @internal v3 compat only
   */
  _createRoot?(options: ComponentOptions): ComponentPublicInstance
}

export type OptionMergeFunction = (to: unknown, from: unknown) => any

export interface AppConfig {
  // @private
  readonly isNativeTag?: (tag: string) => boolean

  performance: boolean
  optionMergeStrategies: Record<string, OptionMergeFunction>
  globalProperties: ComponentCustomProperties & Record<string, any>
  errorHandler?: (
    err: unknown,
    instance: ComponentPublicInstance | null,
    info: string,
  ) => void
  warnHandler?: (
    msg: string,
    instance: ComponentPublicInstance | null,
    trace: string,
  ) => void

  /**
   * Options to pass to `@vue/compiler-dom`.
   * Only supported in runtime compiler build.
   */
  compilerOptions: RuntimeCompilerOptions

  /**
   * @deprecated use config.compilerOptions.isCustomElement
   */
  isCustomElement?: (tag: string) => boolean
}

export interface AppContext {
  app: App // for devtools
  config: AppConfig
  mixins: ComponentOptions[]
  components: Record<string, Component>
  directives: Record<string, Directive>
  provides: Record<string | symbol, any>

  /**
   * Cache for merged/normalized component options
   * Each app instance has its own cache because app-level global mixins and
   * optionMergeStrategies can affect merge behavior.
   * @internal
   */
  optionsCache: WeakMap<ComponentOptions, MergedComponentOptions>
  /**
   * Cache for normalized props options
   * @internal
   */
  propsCache: WeakMap<ConcreteComponent, NormalizedPropsOptions>
  /**
   * Cache for normalized emits options
   * @internal
   */
  emitsCache: WeakMap<ConcreteComponent, ObjectEmitsOptions | null>
  /**
   * HMR only
   * @internal
   */
  reload?: () => void
  /**
   * v2 compat only
   * @internal
   */
  filters?: Record<string, Function>
}

type PluginInstallFunction<Options = any[]> = Options extends unknown[]
  ? (app: App, ...options: Options) => any
  : (app: App, options: Options) => any

export type ObjectPlugin<Options = any[]> = {
  install: PluginInstallFunction<Options>
}
export type FunctionPlugin<Options = any[]> = PluginInstallFunction<Options> &
  Partial<ObjectPlugin<Options>>

export type Plugin<Options = any[]> =
  | FunctionPlugin<Options>
  | ObjectPlugin<Options>
/**
 * 用于创建一个应用程序上下文（App Context）
 * @returns 
 */
export function createAppContext(): AppContext {
  return {
    // 指向当前 Vue 应用实例的引用。在组件内部，你可以通过 getCurrentInstance().appContext.app 访问到这个实例。
    app: null as any,
    // Vue 应用的全局配置信息
    config: {
      // @private 
      isNativeTag: NO,
      // 性能表现追踪
      performance: false,
      globalProperties: {},
      // 用于定义自定义组件选项的合并策略的对象
      optionMergeStrategies: {},
      // 为应用内抛出的未捕获错误指定一个全局处理函数。
      errorHandler: undefined,

      // 运行时警告指定的自定义处理函数
      warnHandler: undefined,

      // 配置运行时编译器的选项。
      compilerOptions: {},
    },
    //  存储混合对象的数组，用于全局注册的混合选项
    mixins: [],
    // 储全局注册的所有组件
    components: {},
    // 存储全局注册的所有指令
    directives: {},
    // 提供（provide）给子孙组件的数据容器，是一个空的原型链上没有任何属性的对象
    provides: Object.create(null),

    // 存储组件选项计算结果
    optionsCache: new WeakMap(),
    // 存储组件props
    propsCache: new WeakMap(),
    // 存储组件emits
    emitsCache: new WeakMap(),
  }
}

export type CreateAppFunction<HostElement> = (
  rootComponent: Component,
  rootProps?: Data | null,
) => App<HostElement>

let uid = 0

export function createAppAPI<HostElement>(
  render: RootRenderFunction<HostElement>,
  hydrate?: RootHydrateFunction,
): CreateAppFunction<HostElement> {
  return function createApp(rootComponent, rootProps = null) {
    // 如果传入的不是一个函数，则会尝试将其转换为一个对象。
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent)
    }
    // 如果rootProps不是null且不是对象，则将rootProps设置为null
    if (rootProps != null && !isObject(rootProps)) {
      __DEV__ && warn(`root props passed to app.mount() must be an object.`)
      rootProps = null
    }
    // 创建一个应用上下文 context
    const context = createAppContext()
    // 保持安装的插件
    const installedPlugins = new WeakSet()
    // 是否已经挂载到dom上了
    let isMounted = false
    // 创建一个App对象
    const app: App = (context.app = {
      // 一个标识，由uid自增
      _uid: uid++,
      // 保存根组件
      _component: rootComponent as ConcreteComponent,
      // 根组件的props
      _props: rootProps,

      _container: null,
      // 上下文
      _context: context,

      _instance: null,

      version,

      // 获取当前实例的配置
      get config() {
        return context.config
      },

      set config(v) {
        if (__DEV__) {
          warn(
            `app.config cannot be replaced. Modify individual options instead.`,
          )
        }
      },

      /**
       * 安装插件并保存到installedPlugins变量中
       * @param plugin 插件
       * @param options 传递给插件的选项
       * @returns 
       */
      use(plugin: Plugin, ...options: any[]) {
        if (installedPlugins.has(plugin)) {
          __DEV__ && warn(`Plugin has already been applied to target app.`)
        } else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin)
          plugin.install(app, ...options)
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin)
          plugin(app, ...options)
        } else if (__DEV__) {
          warn(
            `A plugin must either be a function or an object with an "install" ` +
            `function.`,
          )
        }
        return app
      },
      /**
       * 添加全局mixin，一个全局的 mixin 会作用于应用中的每个组件实例。
       * @param mixin 
       * @returns 
       */
      mixin(mixin: ComponentOptions) {
        if (__FEATURE_OPTIONS_API__) {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin)
          } else if (__DEV__) {
            warn(
              'Mixin has already been applied to target app' +
              (mixin.name ? `: ${mixin.name}` : ''),
            )
          }
        } else if (__DEV__) {
          warn('Mixins are only available in builds supporting Options API')
        }
        return app
      },
      /**
       * 如果同时传递一个组件名字符串及其定义，则注册一个全局组件；
       * 如果只传递一个名字，则会返回用该名字注册的组件 (如果存在的话)。
       * @param name 组件名称
       * @param component 组件对象
       * @returns 
       */
      component(name: string, component?: Component): any {
        if (__DEV__) {
          validateComponentName(name, context.config)
        }
        // 如果没有component参数，则尝试从context.components[name]返回一个组件
        if (!component) {
          return context.components[name]
        }
        if (__DEV__ && context.components[name]) {
          warn(`Component "${name}" has already been registered in target app.`)
        }
        // 将组件保存仅全局(context.components)中
        context.components[name] = component
        return app
      },
      /**
       * 如果同时传递一个名字和一个指令定义，则注册一个全局指令；
       * 如果只传递一个名字，则会返回用该名字注册的指令 (如果存在的话)。
       * @param name 指令名称
       * @param directive 指令对象
       * @returns 
       */
      directive(name: string, directive?: Directive) {
        if (__DEV__) {
          validateDirectiveName(name)
        }
        // 如果没有directive选项，则返回指定名字的指令
        if (!directive) {
          return context.directives[name] as any
        }
        if (__DEV__ && context.directives[name]) {
          warn(`Directive "${name}" has already been registered in target app.`)
        }
        // 将指令保存到全局指令中
        context.directives[name] = directive
        return app
      },
      /**
       * 将应用实例挂载在一个容器元素中。
       * @param rootContainer 可以是一个实际的 DOM 元素或一个 CSS 选择器 (使用第一个匹配到的元素)
       * @param isHydrate (可选）如果设置为 true，则表示当前应用是服务器端渲染（SSR）后的客户端激活（hydration）过程，Vue 将会尝试合并 SSR 生成的静态 HTML 与客户端新创建的 Vue 组件实例
       * @param namespace (可选) 默认值为 undefined。这个参数用于指定挂载时使用的元素命名空间。当值为 true 时，默认使用 SVG 命名空间；当值为 false 或 undefined 时，则不使用任何命名空间；若提供一个字符串类型值，则使用指定的命名空间。
       * @returns 
       */
      mount(
        rootContainer: HostElement,
        isHydrate?: boolean,
        namespace?: boolean | ElementNamespace,
      ): any {
        // 对于每个应用实例，mount() 仅能调用一次。
        if (!isMounted) {
          // #5571
          if (__DEV__ && (rootContainer as any).__vue_app__) {
            warn(
              `There is already an app instance mounted on the host container.\n` +
              ` If you want to mount another app on the same host container,` +
              ` you need to unmount the previous app by calling \`app.unmount()\` first.`,
            )
          }
          // 创建根组件的虚拟节点
          const vnode = createVNode(rootComponent, rootProps)
          // store app context on the root VNode.
          // this will be set on the root instance on initial mount.
          // 在初次挂载根组件时，将应用的上下文信息赋值给根 VNode 的 appContext 属性。
          // 这样一来，任何通过此根节点挂载的组件树都可以访问到该上下文，
          vnode.appContext = context

          if (namespace === true) {
            namespace = 'svg'
          } else if (namespace === false) {
            namespace = undefined
          }

          // HMR root reload
          if (__DEV__) {
            context.reload = () => {
              // casting to ElementNamespace because TS doesn't guarantee type narrowing
              // over function boundaries
              render(
                cloneVNode(vnode),
                rootContainer,
                namespace as ElementNamespace,
              )
            }
          }

          // 如果 isHydrate 为真，并且存在hydrate 函数，则调用该函数对服务器端返回的虚拟节点(vnode)进行客户端激活。
          // 这里的 vnode 是从服务器端渲染得到的虚拟DOM树，而 rootContainer 是实际DOM中的根容器元素。
          if (isHydrate && hydrate) {
            hydrate(vnode as VNode<Node, Element>, rootContainer as any)
          } else {
            // 否则表示是客户端进行首次渲染
            // 调用 render 函数将虚拟节点 vnode 渲染到指定的实际DOM元素 rootContainer 中，namespace 参数可能是指定的SVG或其他命名空间。
            render(vnode, rootContainer, namespace)
          }
          // 将isMounted设置true 表示该实例已经挂载到dom上了
          isMounted = true

          // 将根容器元素赋值给应用实例(app)的一个属性 _container。
          // 这样可以方便后续访问和操作实际挂载组件的DOM容器。
          app._container = rootContainer
            // for devtools and telemetry
            // 主要用于一些开发工具如Vue DevTools能够识别出与该DOM节点关联的应用实例。
            ; (rootContainer as any).__vue_app__ = app

          if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
            app._instance = vnode.component
            devtoolsInitApp(app, version)
          }
          // 返回的是组件实例暴露给外部使用的代理对象
          // getExposeProxy 是一个辅助函数，用于获取组件实例可能存在的暴露代理，如果不存在，则直接返回组件实例本身的代理对象（.proxy）。
          // 这是因为组件内部的状态和方法可能通过代理对象安全地对外部提供访问。
          return getExposeProxy(vnode.component!) || vnode.component!.proxy
        } else if (__DEV__) {
          warn(
            `App has already been mounted.\n` +
            `If you want to remount the same app, move your app creation logic ` +
            `into a factory function and create fresh app instances for each ` +
            `mount - e.g. \`const createMyApp = () => createApp(App)\``,
          )
        }
      },
      /**
       * 卸载一个已挂载的应用实例。
       */
      unmount() {
        if (isMounted) {
          // 调用 render 函数，传入 null 作为第一个参数，这意味着要卸载应用。app._container 是应用挂载的 DOM 元素。
          render(null, app._container)
          if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
            app._instance = null
            devtoolsUnmountApp(app)
          }
          // dom上删除 __vue_app__属性
          delete app._container.__vue_app__
        } else if (__DEV__) {
          warn(`Cannot unmount an app that is not mounted.`)
        }
      },
      // 提供一个值，可以在应用中的所有后代组件中注入使用
      provide(key, value) {
        if (__DEV__ && (key as string | symbol) in context.provides) {
          warn(
            `App already provides property with key "${String(key)}". ` +
            `It will be overwritten with the new value.`,
          )
        }

        context.provides[key as string | symbol] = value

        return app
      },
      // 使用当前应用作为注入上下文执行回调函数
      runWithContext(fn) {
        const lastApp = currentApp
        currentApp = app
        try {
          return fn()
        } finally {
          currentApp = lastApp
        }
      },
    })
    // 兼容v2
    if (__COMPAT__) {
      installAppCompatProperties(app, context, render)
    }
    // 返回app实例
    return app
  }
}

/**
 * @internal Used to identify the current app when using `inject()` within
 * `app.runWithContext()`.
 */
export let currentApp: App<unknown> | null = null
