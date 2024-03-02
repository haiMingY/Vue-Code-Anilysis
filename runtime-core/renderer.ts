import {
  Comment,
  Fragment,
  Static,
  Text,
  type VNode,
  type VNodeArrayChildren,
  type VNodeHook,
  type VNodeProps,
  cloneIfMounted,
  createVNode,
  invokeVNodeHook,
  isSameVNodeType,
  normalizeVNode,
} from './vnode'
import {
  type ComponentInternalInstance,
  type ComponentOptions,
  type Data,
  createComponentInstance,
  setupComponent,
} from './component'
import {
  filterSingleRoot,
  renderComponentRoot,
  shouldUpdateComponent,
  updateHOCHostEl,
} from './componentRenderUtils'
import {
  EMPTY_ARR,
  EMPTY_OBJ,
  NOOP,
  PatchFlags,
  ShapeFlags,
  getGlobalThis,
  invokeArrayFns,
  isArray,
  isReservedProp,
} from '@vue/shared'
import {
  type SchedulerJob,
  flushPostFlushCbs,
  flushPreFlushCbs,
  invalidateJob,
  queueJob,
  queuePostFlushCb,
} from './scheduler'
import { ReactiveEffect, pauseTracking, resetTracking } from '@vue/reactivity'
import { updateProps } from './componentProps'
import { updateSlots } from './componentSlots'
import { popWarningContext, pushWarningContext, warn } from './warning'
import { type CreateAppFunction, createAppAPI } from './apiCreateApp'
import { setRef } from './rendererTemplateRef'
import {
  type SuspenseBoundary,
  type SuspenseImpl,
  queueEffectWithSuspense,
} from './components/Suspense'
import type { TeleportImpl, TeleportVNode } from './components/Teleport'
import { type KeepAliveContext, isKeepAlive } from './components/KeepAlive'
import { isHmrUpdating, registerHMR, unregisterHMR } from './hmr'
import { type RootHydrateFunction, createHydrationFunctions } from './hydration'
import { invokeDirectiveHook } from './directives'
import { endMeasure, startMeasure } from './profiling'
import {
  devtoolsComponentAdded,
  devtoolsComponentRemoved,
  devtoolsComponentUpdated,
  setDevtoolsHook,
} from './devtools'
import { initFeatureFlags } from './featureFlags'
import { isAsyncWrapper } from './apiAsyncComponent'
import { isCompatEnabled } from './compat/compatConfig'
import { DeprecationTypes } from './compat/compatConfig'
import type { TransitionHooks } from './components/BaseTransition'

export interface Renderer<HostElement = RendererElement> {
  render: RootRenderFunction<HostElement>
  createApp: CreateAppFunction<HostElement>
}

export interface HydrationRenderer extends Renderer<Element | ShadowRoot> {
  hydrate: RootHydrateFunction
}

export type ElementNamespace = 'svg' | 'mathml' | undefined

export type RootRenderFunction<HostElement = RendererElement> = (
  vnode: VNode | null,
  container: HostElement,
  namespace?: ElementNamespace,
) => void

export interface RendererOptions<
  HostNode = RendererNode,
  HostElement = RendererElement,
> {
  patchProp(
    el: HostElement,
    key: string,
    prevValue: any,
    nextValue: any,
    namespace?: ElementNamespace,
    prevChildren?: VNode<HostNode, HostElement>[],
    parentComponent?: ComponentInternalInstance | null,
    parentSuspense?: SuspenseBoundary | null,
    unmountChildren?: UnmountChildrenFn,
  ): void
  insert(el: HostNode, parent: HostElement, anchor?: HostNode | null): void
  remove(el: HostNode): void
  createElement(
    type: string,
    namespace?: ElementNamespace,
    isCustomizedBuiltIn?: string,
    vnodeProps?: (VNodeProps & { [key: string]: any }) | null,
  ): HostElement
  createText(text: string): HostNode
  createComment(text: string): HostNode
  setText(node: HostNode, text: string): void
  setElementText(node: HostElement, text: string): void
  parentNode(node: HostNode): HostElement | null
  nextSibling(node: HostNode): HostNode | null
  querySelector?(selector: string): HostElement | null
  setScopeId?(el: HostElement, id: string): void
  cloneNode?(node: HostNode): HostNode
  insertStaticContent?(
    content: string,
    parent: HostElement,
    anchor: HostNode | null,
    namespace: ElementNamespace,
    start?: HostNode | null,
    end?: HostNode | null,
  ): [HostNode, HostNode]
}

// Renderer Node can technically be any object in the context of core renderer
// logic - they are never directly operated on and always passed to the node op
// functions provided via options, so the internal constraint is really just
// a generic object.
export interface RendererNode {
  [key: string]: any
}

export interface RendererElement extends RendererNode { }

// An object exposing the internals of a renderer, passed to tree-shakeable
// features so that they can be decoupled from this file. Keys are shortened
// to optimize bundle size.
export interface RendererInternals<
  HostNode = RendererNode,
  HostElement = RendererElement,
> {
  p: PatchFn
  um: UnmountFn
  r: RemoveFn
  m: MoveFn
  mt: MountComponentFn
  mc: MountChildrenFn
  pc: PatchChildrenFn
  pbc: PatchBlockChildrenFn
  n: NextFn
  o: RendererOptions<HostNode, HostElement>
}

// These functions are created inside a closure and therefore their types cannot
// be directly exported. In order to avoid maintaining function signatures in
// two places, we declare them once here and use them inside the closure.
type PatchFn = (
  n1: VNode | null, // null means this is a mount
  n2: VNode,
  container: RendererElement,
  anchor?: RendererNode | null,
  parentComponent?: ComponentInternalInstance | null,
  parentSuspense?: SuspenseBoundary | null,
  namespace?: ElementNamespace,
  slotScopeIds?: string[] | null,
  optimized?: boolean,
) => void

type MountChildrenFn = (
  children: VNodeArrayChildren,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  namespace: ElementNamespace,
  slotScopeIds: string[] | null,
  optimized: boolean,
  start?: number,
) => void

type PatchChildrenFn = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  namespace: ElementNamespace,
  slotScopeIds: string[] | null,
  optimized: boolean,
) => void

type PatchBlockChildrenFn = (
  oldChildren: VNode[],
  newChildren: VNode[],
  fallbackContainer: RendererElement,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  namespace: ElementNamespace,
  slotScopeIds: string[] | null,
) => void

type MoveFn = (
  vnode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  type: MoveType,
  parentSuspense?: SuspenseBoundary | null,
) => void

type NextFn = (vnode: VNode) => RendererNode | null

type UnmountFn = (
  vnode: VNode,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  doRemove?: boolean,
  optimized?: boolean,
) => void

type RemoveFn = (vnode: VNode) => void

type UnmountChildrenFn = (
  children: VNode[],
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  doRemove?: boolean,
  optimized?: boolean,
  start?: number,
) => void

export type MountComponentFn = (
  initialVNode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  namespace: ElementNamespace,
  optimized: boolean,
) => void

type ProcessTextOrCommentFn = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
) => void

export type SetupRenderEffectFn = (
  instance: ComponentInternalInstance,
  initialVNode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentSuspense: SuspenseBoundary | null,
  namespace: ElementNamespace,
  optimized: boolean,
) => void

export enum MoveType {
  ENTER,
  LEAVE,
  REORDER,
}

export const queuePostRenderEffect = __FEATURE_SUSPENSE__
  ? __TEST__
    ? // vitest can't seem to handle eager circular dependency
    (fn: Function | Function[], suspense: SuspenseBoundary | null) =>
      queueEffectWithSuspense(fn, suspense)
    : queueEffectWithSuspense
  : queuePostFlushCb

/**
 * The createRenderer function accepts two generic arguments:
 * HostNode and HostElement, corresponding to Node and Element types in the
 * host environment. For example, for runtime-dom, HostNode would be the DOM
 * `Node` interface and HostElement would be the DOM `Element` interface.
 *
 * Custom renderers can pass in the platform specific types like this:
 *
 * ``` js
 * const { render, createApp } = createRenderer<Node, Element>({
 *   patchProp,
 *   ...nodeOps
 * })
 * ```
 */
export function createRenderer<
  HostNode = RendererNode,
  HostElement = RendererElement,
>(options: RendererOptions<HostNode, HostElement>) {
  return baseCreateRenderer<HostNode, HostElement>(options)
}

// Separate API for creating hydration-enabled renderer.
// Hydration logic is only used when calling this function, making it
// tree-shakable.
export function createHydrationRenderer(
  options: RendererOptions<Node, Element>,
) {
  return baseCreateRenderer(options, createHydrationFunctions)
}

// overload 1: no hydration
function baseCreateRenderer<
  HostNode = RendererNode,
  HostElement = RendererElement,
>(options: RendererOptions<HostNode, HostElement>): Renderer<HostElement>

// overload 2: with hydration
function baseCreateRenderer(
  options: RendererOptions<Node, Element>,
  createHydrationFns: typeof createHydrationFunctions,
): HydrationRenderer

// implementation
function baseCreateRenderer(
  options: RendererOptions,
  createHydrationFns?: typeof createHydrationFunctions,
): any {
  // compile-time feature flags check
  if (__ESM_BUNDLER__ && !__TEST__) {
    initFeatureFlags()
  }

  const target = getGlobalThis()
  target.__VUE__ = true
  if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
    setDevtoolsHook(target.__VUE_DEVTOOLS_GLOBAL_HOOK__, target)
  }

  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent,
  } = options

  // Note: functions inside this closure should use `const xxx = () => {}`
  // style in order to prevent being inlined by minifiers.
  // 采用箭头函数的形式来声明函数，这样可以确保它们不会被（minifiers）意外地内联处理，同时保留所需的作用域和上下文。
  /**
   * 这个函数会被用来比较新旧虚拟节点（VNode）之间的差异，并将这些差异更新到实际的 DOM 上。
   * @param n1 旧的虚拟节点（VNode）
   * @param n2 新的虚拟节点（VNode）
   * @param container 容器 DOM 元素，新的虚拟节点将被挂载到这个元素上
   * @param anchor 可选参数(默认null)，指定在哪个真实DOM元素之后插入新节点。
   * @param parentComponent 可选参数(默认null),父组件实例
   * @param parentSuspense 可选参数(默认null) 当前操作所属的父级Suspense实例，用于处理异步加载内容
   * @param namespace 可选参数(默认undefined) 命名空间，用于特殊环境下的渲染，如SVG
   * @param slotScopeIds 可选参数(默认null) 用于追踪插槽作用域 ID
   * @param optimized 指示是否应该使用优化策略
   * @returns 
   */
  const patch: PatchFn = (
    n1,
    n2,
    container,
    anchor = null,
    parentComponent = null,
    parentSuspense = null,
    namespace = undefined,
    slotScopeIds = null,
    optimized = __DEV__ && isHmrUpdating ? false : !!n2.dynamicChildren,
  ) => {
    // 如果是同一个虚拟DOM节点，下面就不用比了
    if (n1 === n2) {
      return
    }

    // patching & not same type, unmount old tree
    // 处理节点类型不同的情况,当类型不同时，将旧的dom树卸载掉。
    if (n1 && !isSameVNodeType(n1, n2)) {
      // 获取旧虚拟节点的真实DOM对象的的下一个兄弟节点，这将作为新节点挂载的锚点
      anchor = getNextHostNode(n1)
      // 卸载旧虚拟节点 n1 及其所有子节点。这涉及到销毁组件实例、解绑事件监听器、移除数据观察者等操作
      unmount(n1, parentComponent, parentSuspense, true)
      // 将 n1 设置为 null，表示旧虚拟节点已经被完全卸载，不再需要引用它。
      n1 = null
    }
    // PatchFlags.BAIL表明这个虚拟节点不需要优化
    if (n2.patchFlag === PatchFlags.BAIL) {
      optimized = false
      n2.dynamicChildren = null
    }
    const { type, ref, shapeFlag } = n2
    // 根据给定的n2节点（新节点）的type属性和shapeFlag标志位，选择合适的更新策略或挂载策略。
    switch (type) {
      // 当n2是文本节点（Text类型）时
      case Text:
        // 调用processText函数来处理文本内容的创建或更新
        processText(n1, n2, container, anchor)
        break
      case Comment:
        // 当n2是注释节点（Comment类型）时，调用processCommentNode函数来处理注释节点的更新。
        processCommentNode(n1, n2, container, anchor)
        break
      case Static:
        // 当n2是静态节点（Static类型）时，若n1为空，则调用mountStaticNode挂载新节点
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, namespace)
        } else if (__DEV__) {
          patchStaticNode(n1, n2, container, namespace)
        }
        break
      case Fragment:
        // 当n2是Fragment类型，调用processFragment函数处理片段节点及其包含的多个子节点的更新。
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
        break
      default:
        // 若n2的形状标志位等于ShapeFlags.ELEMENT，说明它是HTML元素节点，
        // 调用processElement函数处理元素节点的更新
        if (shapeFlag & ShapeFlags.ELEMENT) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        } else if (shapeFlag & ShapeFlags.COMPONENT) {
          // 若n2的形状标志位等于ShapeFlags.COMPONENT，说明它是组件节点，
          // 调用processComponent函数处理组件及其实例的更新
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        } else if (shapeFlag & ShapeFlags.TELEPORT) {
          // n2的形状标志位是ShapeFlags.TELEPORT，调用对应的Teleport组件的process方法处理传送门节点。
          ; (type as typeof TeleportImpl).process(
            n1 as TeleportVNode,
            n2 as TeleportVNode,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals,
          )
        } else if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
          // 若支持Suspense功能并且n2的形状标志位是ShapeFlags.SUSPENSE，
          // 调用对应的Suspense组件的process方法处理Suspense节点。
          ; (type as typeof SuspenseImpl).process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals,
          )
        } else if (__DEV__) {
          // 在开发环境中，如果遇到未知的节点类型，会发出警告信息。
          warn('Invalid VNode type:', type, `(${typeof type})`)
        }
    }

    // set ref
    // 如果n2的ref引用不为空且parentComponent存在
    if (ref != null && parentComponent) {
      // 调用setRef函数来设置或更新ref
      setRef(ref, n1 && n1.ref, parentSuspense, n2 || n1, !n2)
    }
  }
  // 用于在 DOM 中创建、更新或替换文本节点。
  const processText: ProcessTextOrCommentFn = (n1, n2, container, anchor) => {
    // n1为null 这说明是新的节点
    if (n1 == null) {
      // 调用实际的DOM操作
      // 就相当于 container.insertBefore(n2.el, anchor || null)
      hostInsert(
        //调用hostCreateText函数就相当于document.createTextNode(n2.children)
        (n2.el = hostCreateText(n2.children as string)),
        container,
        anchor,
      )
    } else {
      // 如果 n1 不是 null，说明有一个现有的文本节点需要被更新或复用。

      // 将 n1.el（现有的 DOM 文本节点）赋值给 n2.el（新虚拟节点的 DOM 节点引用）。
      // 同时，将 n1.el 赋值给常量 el，以便后续使用。
      const el = (n2.el = n1.el!)
      // 检查新虚拟节点 n2 的 children 属性（即文本内容）是否与旧虚拟节点 n1 的不同
      if (n2.children !== n1.children) {
        // 不相同 则更新文本内容
        // 相当于 el.nodeValue = n2.children 
        hostSetText(el, n2.children as string)
      }
    }
  }
  // 该函数用于处理注释节点的创建和更新
  const processCommentNode: ProcessTextOrCommentFn = (
    n1,
    n2,
    container,
    anchor,
  ) => {
    // 如果n1为空，则说明需要创建新的注释节点
    if (n1 == null) {
      //hostInsert函数相当于container.insertBefore(n2.el, anchor || null)
      hostInsert(
        // 以n2.children为内容创建新的注释节点
        // hostCreateComment函数相当于document.createComment(n2.children)
        (n2.el = hostCreateComment((n2.children as string) || '')),
        container,
        anchor,
      )
    } else {
      // there's no support for dynamic comments
      // 当前函数不支持动态注释。也就是说，如果新的注释节点与旧的注释节点不同，这个函数不会更新注释的内容。
      // n2的el属性指向现有的n1.el，实现复用已存在的DOM文本节点
      n2.el = n1.el
    }
  }
  /**
   * 该函数用于将静态节点（Static Node）挂载到 DOM 中。静态节点通常是在编译时确定的，不会发生变化，
   * 因此它们可以在初始化时一次性插入到 DOM 中，而不需要像动态节点那样进行频繁的更新。
   * 
   * mountStaticNode 函数的作用是将静态内容一次性插入到 DOM 中，避免了不必要的虚拟 DOM 比较和更新操作，提高了渲染性能。
   * 这在处理大量静态内容或频繁渲染的场景下非常有用
   * @param n2  新的虚拟节点（VNode），它代表要挂载的静态内容
   * @param container 容器元素，静态节点将被插入到这个元素中
   * @param anchor 锚点节点，用于确定静态节点在容器中的插入位置。如果为 null，则静态节点会被添加到容器的末尾。
   * @param namespace 元素的命名空间，用于处理像 SVG 这样的特殊元素。
   */
  const mountStaticNode = (
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    namespace: ElementNamespace,
  ) => {
    // static nodes are only present when used with compiler-dom/runtime-dom
    // which guarantees presence of hostInsertStaticContent.
    // hostInsertStaticContent专门用来高效地将这些静态内容直接插入DOM树中，而不需要经过复杂的虚拟DOM diff算法
    // 返回新插入的节点和它的后一个兄弟元素，为了方便后续的移动和删除操作
    ;[n2.el, n2.anchor] = hostInsertStaticContent!(
      n2.children as string,
      container,
      anchor,
      namespace,
      n2.el,
      n2.anchor,
    )
  }

  /**
   * Dev / HMR only
   */
  const patchStaticNode = (
    n1: VNode,
    n2: VNode,
    container: RendererElement,
    namespace: ElementNamespace,
  ) => {
    // static nodes are only patched during dev for HMR
    if (n2.children !== n1.children) {
      const anchor = hostNextSibling(n1.anchor!)
      // remove existing
      removeStaticNode(n1)
        // insert new
        ;[n2.el, n2.anchor] = hostInsertStaticContent!(
          n2.children as string,
          container,
          anchor,
          namespace,
        )
    } else {
      n2.el = n1.el
      n2.anchor = n1.anchor
    }
  }

  /**
   * 该函数用于移动静态节点（Static Node）在 DOM 树中的位置
   * 也就是负责将已经存在的静态节点从一个位置移动到另一个位置。
   * @param VNode el 为静态节点的dom对象 anchor为el的下一个兄弟对象或者是el本身
   * @param container 目标容器元素，静态节点将被移动到这个容器内。
   * @param nextSibling 静态节点将要移动到的位置的下一个兄弟节点。如果为 null，则静态节点将被添加到容器的末尾。
   */
  const moveStaticNode = (
    { el, anchor }: VNode,
    container: RendererElement,
    nextSibling: RendererNode | null,
  ) => {
    // 遍历静态节点范围内的所有元素，并将它们从当前位置移动到目标位置
    let next
    while (el && el !== anchor) {
      // 获取el的下一个兄弟节点 相当于el.nextSibling
      next = hostNextSibling(el)
      // 将el 插入到contaainer中的nextSibling元素之前
      hostInsert(el, container, nextSibling)
      // 将el 指向next
      el = next
    }
    // anchor插入到container中的nextSibling元素之前
    // 就相当于 container.insertBefore(anchor,nextSibling)
    hostInsert(anchor!, container, nextSibling)
  }
  /**
   * 它的作用是从DOM树中移除一组连续的静态节点，该组节点由输入参数中的el（开始节点）和anchor（结束节点前一个节点）标识。
   * @param el 要移除的静态节点
   * @param anchor 静态节点的结束边界，也可能是el对象本身
   */
  const removeStaticNode = ({ el, anchor }: VNode) => {
    let next
    // 循环删除
    while (el && el !== anchor) {
      // 获取el的下一个兄弟元素
      next = hostNextSibling(el)
      /**
       * hostRemove函数就相当于下面的代码
       * ```js
       * const parent = el.parentNode
       * if (parent) {
       *    parent.removeChild(el)
       * }
       * ```
       */
      hostRemove(el)
      // 将el指向next
      el = next
    }
    // 删除anchor
    hostRemove(anchor!)
  }

  /**
   * 该函数用于处理和更新DOM元素类型的虚拟节点（VNode）
   * @param n1 旧的虚拟节点
   * @param n2 新的虚拟节点
   * @param container dom容器，新节点将被挂载或更新到这个容器内
   * @param anchor 锚点节点，用于确定新节点在容器中的插入位置。如果为 null，则新节点会被添加到容器的末尾。
   * @param parentComponent 父组件实例，如果当前节点是组件的一部分，则这个参数表示它的父组件。
   * @param parentSuspense 父级Suspense实例，用于处理组件的异步加载和挂起状态
   * @param namespace 元素的命名空间，用于处理像 SVG 或 MathML 这样的特殊元素
   * @param slotScopeIds 插槽作用域 ID 数组，用于处理带有作用域插槽的元素
   * @param optimized 一个优化标志，指示是否执行某些优化操作
   */
  const processElement = (
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => {
    // 根据节点的类型设置namespace
    if (n2.type === 'svg') {
      namespace = 'svg'
    } else if (n2.type === 'math') {
      namespace = 'mathml'
    }
    // 如果n1为null 则说明n1已经被卸载了，直接将n2挂载到dom上就可以了
    if (n1 == null) {
      //调用mountElement函数讲n2挂载到dom上
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
      )
    } else {
      // 否则调用patchElement()将新旧节点对比更新
      patchElement(
        n1,
        n2,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
      )
    }
  }
  /**
   * mountElement函数负责创建和挂载DOM元素。
   * 函数根据给定的虚拟节点（VNode）信息创建实际的DOM元素，并处理各种属性、子节点、指令、过渡效果和生命周期钩子。
   * @param vnode 要挂载的虚拟节点
   * @param container DOM 容器，新创建的元素将被挂载到这个容器内
   * @param anchor 锚点节点，用于确定新元素在容器中的插入位置。如果为 null，则新元素会被添加到容器的末尾。
   * @param parentComponent 父组件实例，如果当前节点是组件的一部分，则这个参数表示它的父组件。
   * @param parentSuspense Suspense实例，用于处理组件的异步加载和挂起状态
   * @param namespace 元素的命名空间，例如 SVG 或 MathML 的特殊命名空间
   * @param slotScopeIds 插槽作用域 ID 数组，用于处理带有作用域插槽的元素。
   * @param optimized 一个优化标志，指示是否执行某些优化操作。
   */
  const mountElement = (
    vnode: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => {
    let el: RendererElement
    let vnodeHook: VNodeHook | undefined | null

    const { props, shapeFlag, transition, dirs } = vnode
    // 根据vnode.type(元素类型)，namespace(元素命名空间)和props(属性)创建实际的DOM元素，
    // 并将其保存在虚拟节点的el属性上。
    el = vnode.el = hostCreateElement(
      vnode.type as string,
      namespace,
      props && props.is,
      props,
    )

    // mount children first, since some props may rely on child content
    // being already rendered, e.g. `<select value>`
    // 根据 vnode 的 shapeFlag 判断子节点的类型。
    // 如果子节点是文本类型（ShapeFlags.TEXT_CHILDREN），则使用 hostSetElementText 设置元素的文本内容
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      // 调用hostSetElementText函数就相当于el.textContent = vnode.children
      hostSetElementText(el, vnode.children as string)
    } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      // 如果子节点是数组类型（ShapeFlags.ARRAY_CHILDREN)
      // 则调用mountChildren函数处理子节点的挂载
      mountChildren(
        vnode.children as VNodeArrayChildren,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(vnode, namespace),
        slotScopeIds,
        optimized,
      )
    }

    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, 'created')
    }
    // scopeId
    setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent)
    // props
    if (props) {
      for (const key in props) {
        if (key !== 'value' && !isReservedProp(key)) {
          hostPatchProp(
            el,
            key,
            null,
            props[key],
            namespace,
            vnode.children as VNode[],
            parentComponent,
            parentSuspense,
            unmountChildren,
          )
        }
      }
      /**
       * Special case for setting value on DOM elements:
       * - it can be order-sensitive (e.g. should be set *after* min/max, #2325, #4024)
       * - it needs to be forced (#1471)
       * #2353 proposes adding another renderer option to configure this, but
       * the properties affects are so finite it is worth special casing it
       * here to reduce the complexity. (Special casing it also should not
       * affect non-DOM renderers)
       */
      if ('value' in props) {
        hostPatchProp(el, 'value', null, props.value, namespace)
      }
      if ((vnodeHook = props.onVnodeBeforeMount)) {
        invokeVNodeHook(vnodeHook, parentComponent, vnode)
      }
    }

    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      Object.defineProperty(el, '__vnode', {
        value: vnode,
        enumerable: false,
      })
      Object.defineProperty(el, '__vueParentComponent', {
        value: parentComponent,
        enumerable: false,
      })
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount')
    }
    // #1583 For inside suspense + suspense not resolved case, enter hook should call when suspense resolved
    // #1689 For inside suspense + suspense resolved case, just call it
    const needCallTransitionHooks = needTransition(parentSuspense, transition)
    if (needCallTransitionHooks) {
      transition!.beforeEnter(el)
    }
    hostInsert(el, container, anchor)
    if (
      (vnodeHook = props && props.onVnodeMounted) ||
      needCallTransitionHooks ||
      dirs
    ) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode)
        needCallTransitionHooks && transition!.enter(el)
        dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted')
      }, parentSuspense)
    }
  }

  const setScopeId = (
    el: RendererElement,
    vnode: VNode,
    scopeId: string | null,
    slotScopeIds: string[] | null,
    parentComponent: ComponentInternalInstance | null,
  ) => {
    if (scopeId) {
      hostSetScopeId(el, scopeId)
    }
    if (slotScopeIds) {
      for (let i = 0; i < slotScopeIds.length; i++) {
        hostSetScopeId(el, slotScopeIds[i])
      }
    }
    if (parentComponent) {
      let subTree = parentComponent.subTree
      if (
        __DEV__ &&
        subTree.patchFlag > 0 &&
        subTree.patchFlag & PatchFlags.DEV_ROOT_FRAGMENT
      ) {
        subTree =
          filterSingleRoot(subTree.children as VNodeArrayChildren) || subTree
      }
      if (vnode === subTree) {
        const parentVNode = parentComponent.vnode
        setScopeId(
          el,
          parentVNode,
          parentVNode.scopeId,
          parentVNode.slotScopeIds,
          parentComponent.parent,
        )
      }
    }
  }
  /**
   * mountChildren函数的主要任务是遍历给定的子节点数组，并依次将每个子节点挂载到指定的DOM容器中。
   * @param children 子节点数组，通常是从父级VNode的children属性获取的
   * @param container 容器元素，子节点将被挂载到这个元素之下
   * @param anchor 锚点节点，用于确定子元素在容器中的插入位置
   * @param parentComponent 父组件实例，如果当前节点是组件的一部分，则这个参数表示它的父组件
   * @param parentSuspense 父级Suspense，用于处理异步渲染时的挂起状态
   * @param namespace 元素的命名空间
   * @param slotScopeIds 插槽作用域ID数组，用于识别作用域插槽
   * @param optimized 是否启用优化模式，如果为true，会对子节点进行克隆优化后再进行挂载
   * @param start 遍历子节点数组的起始索引，默认为0。
   */
  const mountChildren: MountChildrenFn = (
    children,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace: ElementNamespace,
    slotScopeIds,
    optimized,
    start = 0,
  ) => {
    // 遍历 children 数组，从 start 索引开始，直到数组末尾。
    for (let i = start; i < children.length; i++) {
      // 如果 optimized 为 true，则调用 cloneIfMounted 函数尝试克隆已经挂载过的子节点。
      // 这通常用于优化性能，避免不必要的节点创建和销毁。
      const child = (children[i] = optimized
        ? cloneIfMounted(children[i] as VNode)
        // 如果 optimized 为 false 或者子节点没有被挂载过，则调用 normalizeVNode 函数标准化子节点
        // 这个函数可能会处理一些特殊情况，比如将字符串转换为文本节点，或者将对象转换为标准的虚拟节点格式。
        : normalizeVNode(children[i]))

      // 调用patch函数将处理过的子节点挂载到 DOM 上
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
      )
    }
  }
  /**
   * 负责比较并更新两个虚拟DOM元素（VNode）之间的差异，进而更新实际的DOM元素
   * @param n1 旧的虚拟节点
   * @param n2 新的虚拟节点
   * @param parentComponent 父组件实例
   * @param parentSuspense 父级Suspense，用于处理异步渲染时的挂起状态
   * @param namespace 元素的命名空间
   * @param slotScopeIds 插槽作用域ID数组
   * @param optimized 是否启用优化模式
   */
  const patchElement = (
    n1: VNode,
    n2: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => {
    // 将 n2 的 el 属性设置为 n1 的 el，即复用旧的 DOM 元素
    const el = (n2.el = n1.el!)
    // 从新节点n2中获取以下属性
    // patchFlag 用于标记 VNode 的更新类型，dynamicChildren 是动态子节点的数组，dirs 是指令数组。
    let { patchFlag, dynamicChildren, dirs } = n2
    // #1426 take the old vnode's patch flag into account since user may clone a
    // compiler-generated vnode, which de-opts to FULL_PROPS
    // 这是为了确保，如果旧 VNode 被克隆并失去了某些优化，那么新 VNode 也会相应地失去这些优化，以确保更新过程的正确性
    patchFlag |= n1.patchFlag & PatchFlags.FULL_PROPS

    // oldProps和newProps变量分别存储了旧虚拟节点（n1）和新虚拟节点（n2）的属性对象。
    // 如果实际的属性对象不存在，则默认为一个空对象。
    const oldProps = n1.props || EMPTY_OBJ
    const newProps = n2.props || EMPTY_OBJ
    let vnodeHook: VNodeHook | undefined | null

    // disable recurse in beforeUpdate hooks
    // 在执行钩子函数之前，会暂时关闭组件实例（parentComponent）的递归更新。
    // 这是为了防止在执行钩子函数过程中意外触发组件的其它更新操作，造成无限递归。
    parentComponent && toggleRecurse(parentComponent, false)
    if ((vnodeHook = newProps.onVnodeBeforeUpdate)) {
      // 如果新虚拟节点（n2）的onVnodeBeforeUpdate钩子存在，调用invokeVNodeHook函数执行该钩子，
      // 参数包括父组件实例（parentComponent）、新虚拟节点（n2）和旧虚拟节点（n1）。
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
    }
    // 如果还有指令（dirs）需要处理，在更新前也会调用指令的beforeUpdate钩子函数，
    if (dirs) {
      // 通过invokeDirectiveHook函数执行
      invokeDirectiveHook(n2, n1, parentComponent, 'beforeUpdate')
    }
    // 恢复开启组件实例（parentComponent）的递归更新。
    parentComponent && toggleRecurse(parentComponent, true)

    if (__DEV__ && isHmrUpdating) {
      // HMR updated, force full diff
      patchFlag = 0
      optimized = false
      dynamicChildren = null
    }
    // 如果新节点n2存在dynamicChildren（动态子节点列表），
    // 这意味着子节点是动态生成的（例如，由v-for指令生成的列表项）
    if (dynamicChildren) {
      // 调用patchBlockChildren函数来更新子节点。该函数会比较新旧动态子节点列表，并根据差异最小化地更新DOM
      patchBlockChildren(
        n1.dynamicChildren!,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
      )
      if (__DEV__) {
        // necessary for HMR
        traverseStaticChildren(n1, n2)
      }
    } else if (!optimized) {
      // full diff
      // 若新节点n2没有dynamicChildren，并且当前未开启优化(!optimized)，
      // 那么将调用patchChildren函数进行全量的子节点对比更新。
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
        false,
      )
    }
    // 如果pacthFlag大于0表示可以根据pacthFlag标志位来确定如何最有效地更新元素
    if (patchFlag > 0) {
      // the presence of a patchFlag means this element's render code was
      // generated by the compiler and can take the fast path.
      // in this path old node and new node are guaranteed to have the same shape
      // (i.e. at the exact same position in the source template)
      // 如果 patchFlag 大于 0，这意味着这个元素是由编译器生成的，并且可以采用快速路径进行更新。
      // 在这种情况下，旧节点和新节点保证具有相同的结构（即在源模板中的确切相同位置）。
      if (patchFlag & PatchFlags.FULL_PROPS) {
        // element props contain dynamic keys, full diff needed
        // 如果patchFlag值为PatchFlags.CLASS，表示元素的props包含动态键，此时需要对props进行全面的差异化更新
        patchProps(
          el,
          n2,
          oldProps,
          newProps,
          parentComponent,
          parentSuspense,
          namespace,
        )
      } else {
        // class
        // this flag is matched when the element has dynamic class bindings.
        // 若patchFlag值为PatchFlags.CLASS这个标志，表明元素拥有动态的class绑定。
        // 此时检查oldProps和newProps的class属性是否不同，如果不同，则更新元素的class属性。
        if (patchFlag & PatchFlags.CLASS) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, 'class', null, newProps.class, namespace)
          }
        }

        // style
        // this flag is matched when the element has dynamic style bindings
        // 如果 patchFlag 包含了 PatchFlags.STYLE 标志，这意味着元素有动态样式绑定。
        // 此时，使用 hostPatchProp 函数更新 DOM 元素的样式。
        if (patchFlag & PatchFlags.STYLE) {
          hostPatchProp(el, 'style', oldProps.style, newProps.style, namespace)
        }

        // props
        // This flag is matched when the element has dynamic prop/attr bindings
        // other than class and style. The keys of dynamic prop/attrs are saved for
        // faster iteration.
        // Note dynamic keys like :[foo]="bar" will cause this optimization to
        // bail out and go through a full diff because we need to unset the old key
        // 如果 patchFlag 为PatchFlags.PROPS 标志，这意味着除了class和style之外，如果元素有其他动态prop/attribute绑定
        // 则遍历 dynamicProps 数组，并比较旧属性和新属性中的值是否不同。
        // 如果不同，或者属性是 value（通常见于表单元素），则使用 hostPatchProp 函数更新 DOM 元素的属性。
        if (patchFlag & PatchFlags.PROPS) {
          // if the flag is present then dynamicProps must be non-null
          const propsToUpdate = n2.dynamicProps!
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i]
            const prev = oldProps[key]
            const next = newProps[key]
            // #1471 force patch value
            if (next !== prev || key === 'value') {
              hostPatchProp(
                el,
                key,
                prev,
                next,
                namespace,
                n1.children as VNode[],
                parentComponent,
                parentSuspense,
                unmountChildren,
              )
            }
          }
        }
      }

      // text
      // This flag is matched when the element has only dynamic text children.
      // 如果patchFlag 为 PatchFlags.TEXT，表示元素仅包含动态文本子节点。
      if (patchFlag & PatchFlags.TEXT) {
        // 当旧子节点与新子节点不同时，更新元素的文本内容。
        if (n1.children !== n2.children) {
          // 相当于 el.textContent =  n2.children
          hostSetElementText(el, n2.children as string)
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      // unoptimized, full diff
      //未优化且没有动态子节点
      // 那么代码将执行完整的属性差异比较。
      // 这意味着它会调用 patchProps 函数，就像之前处理 PatchFlags.FULL_PROPS 那样，进行完整的属性更新比较。
      patchProps(
        el,
        n2,
        oldProps,
        newProps,
        parentComponent,
        parentSuspense,
        namespace,
      )
    }
    // 检查新属性 (newProps) 中是否存在 onVnodeUpdated 钩子，或者是否存在指令 (dirs)
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      // 如果存在这些情况之一，它将使用 queuePostRenderEffect 函数来安排一个后渲染效果。
      // 这个效果会在当前的渲染过程结束后执行，确保 DOM 已经更新。
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
        dirs && invokeDirectiveHook(n2, n1, parentComponent, 'updated')
      }, parentSuspense)
    }
  }

  /**
   * The fast path for blocks.
   * 当检测到dynamicChildren存在时，所采用的是针对动态子元素列表的一个快速更新方法——即patchBlockChildren函数，
   * 它可能设计得更为高效，能更快地处理大量动态生成的子元素的变化，而不是对每一个子元素都做深度遍历和详细的diff比对。
   * 这样的优化有助于提升性能，特别是在大规模数据渲染场景下。
   * @param oldChildren 旧的虚拟节点数组，代表上一轮渲染时的子节点集合
   * @param newChildren 新的虚拟节点数组，代表当前需要更新到页面上的子节点集合
   * @param fallbackContainer 一个备用的父容器元素，当无法从旧节点获取有效父容器时使用。
   * @param parentComponent 父组件实例
   * @param parentSuspense 父组件suspense实例 
   * @param namespace 命名空间
   * @param slotScopeIds 插槽作用域 ID 的数组
   */
  const patchBlockChildren: PatchBlockChildrenFn = (
    oldChildren,
    newChildren,
    fallbackContainer,
    parentComponent,
    parentSuspense,
    namespace: ElementNamespace,
    slotScopeIds,
  ) => {
    // 遍历新子节点数组
    for (let i = 0; i < newChildren.length; i++) {
      // 旧节点
      const oldVNode = oldChildren[i]
      // 新节点
      const newVNode = newChildren[i]
      // Determine the container (parent element) for the patch.
      // 对于每个新子节点，确定其应该被挂载（或更新）的容器（即父元素）
      const container =
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        // 这个条件首先检查 oldVNode 是否有一个已经挂载的 DOM 元素（el 属性）。
        // 如果 oldVNode 没有挂载（可能是因为异步组件在 Suspense 中出错，导致没有实际的 DOM 元素），
        // 那么后续的逻辑就不会执行，直接使用 fallbackContainer 作为容器。
        oldVNode.el &&
          // - In the case of a Fragment, we need to provide the actual parent
          // of the Fragment itself so it can move its children.
          // 如果 oldVNode 是一个片段（Fragment），则需要提供片段本身的父元素，这样片段就可以移动它的子节点。
          // 在 Vue 中，片段是一种特殊的 VNode，它允许我们返回多个根节点，这些根节点在 DOM 中会被包裹在一个父元素内。
          (oldVNode.type === Fragment ||
            // - In the case of different nodes, there is going to be a replacement
            // which also requires the correct parent container
            // 检查新旧 VNode 是否是相同类型的节点。
            // 如果不是，这意味着需要替换整个节点
            !isSameVNodeType(oldVNode, newVNode) ||
            // - In the case of a component, it could contain anything.
            // 检查 oldVNode 是否是一个组件或者一个 Teleport 节点
            oldVNode.shapeFlag & (ShapeFlags.COMPONENT | ShapeFlags.TELEPORT))
          ?
          // 如果以上条件都满足，就获取旧节点的dom元素的父元素
          hostParentNode(oldVNode.el)!
          : // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          // 对于某些特定情况（如旧节点不存在有效的DOM节点、或是不需要依赖父容器进行操作的情况）
          // 可以直接使用fallbackContainer作为当前新节点的父容器。
          fallbackContainer
      // 调用patch函数对比新旧节点进行更新
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        true, // 表示需要优化策略操作
      )
    }
  }
  /**
   * 根据新的虚拟DOM节点（VNode）中的属性（newProps）与旧的属性（oldProps）进行差异比对来进行实际DOM属性的修改
   * @param el   需要更新属性的 DOM 元素
   * @param vnode 虚拟节点（VNode）
   * @param oldProps 旧的属性对象。
   * @param newProps 新的属性对象
   * @param parentComponent 父组件实例
   * @param parentSuspense 父级Suspense组件实例
   * @param namespace 命名空间
   */
  const patchProps = (
    el: RendererElement,
    vnode: VNode,
    oldProps: Data,
    newProps: Data,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
  ) => {
    // 当oldProps和newProps不是同一个对象时，在进行处理
    if (oldProps !== newProps) {
      // 如果旧属性对象不为空
      if (oldProps !== EMPTY_OBJ) {
        // 遍历旧属性对象和新属性对象进行对比
        for (const key in oldProps) {
          // 如果key不是vue的内部定义的key值(如，ref,key等)且在newProps中不存在
          if (!isReservedProp(key) && !(key in newProps)) {
            // 调用hostPatchProp将key从el对象上移除
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              namespace,
              vnode.children as VNode[],
              parentComponent,
              parentSuspense,
              unmountChildren,
            )
          }
        }
      }

      // 遍历新属性对象newProps，对于不在旧属性对象中或者值发生变化的属性（除了特殊保留字value），
      // 调用hostPatchProp函数更新DOM元素的属性值。
      for (const key in newProps) {
        // empty string is not valid prop
        if (isReservedProp(key)) continue
        const next = newProps[key]
        const prev = oldProps[key]
        // defer patching value
        // 值不同，且key不是value在调用hostPatchProp进行更新
        if (next !== prev && key !== 'value') {
          hostPatchProp(
            el,
            key,
            prev,
            next,
            namespace,
            vnode.children as VNode[],
            parentComponent,
            parentSuspense,
            unmountChildren,
          )
        }
      }
      // 对于value属性，单独处理，因为它通常需要特殊的更新方式
      if ('value' in newProps) {
        hostPatchProp(el, 'value', oldProps.value, newProps.value, namespace)
      }
    }
  }
  /**
   * processFragment函数负责处理虚拟DOM中的Fragment类型的节点的更新
   * @param n1  旧虚拟节点
   * @param n2  新的虚拟节点
   * @param container 容器元素，虚拟节点将被插入到这个dom元素内
   * @param anchor 锚点元素，如果存在将新的dom元素插入到这个元素之前
   * @param parentComponent 父组件实例
   * @param parentSuspense 父级Suspense组件实例
   * @param namespace 命名空间
   * @param slotScopeIds 插槽作用域 ID 数组
   * @param optimized 是否进行优化
   */
  const processFragment = (
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => {
    // 如果n1(即旧的虚拟节点)不为空，那就复用其起始和结束锚点的DOM元素，否则创建两个空白文本节点作为锚点。
    const fragmentStartAnchor = (n2.el = n1 ? n1.el : hostCreateText(''))!
    const fragmentEndAnchor = (n2.anchor = n1 ? n1.anchor : hostCreateText(''))!
    /**
     * patchFlag 一个标志位，用于指示如应该如何更新虚拟节点
     * dynamicChildren n2的动态子节点数组
     * fragmentSlotScopeIds n2的插槽作用域id数组
     */
    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2

    // 用于开发环境的
    if (
      __DEV__ &&
      // #5523 dev root fragment may inherit directives
      (isHmrUpdating || patchFlag & PatchFlags.DEV_ROOT_FRAGMENT)
    ) {
      // HMR updated / Dev root fragment (w/ comments), force full diff
      patchFlag = 0
      optimized = false
      dynamicChildren = null
    }

    // check if this is a slot fragment with :slotted scope ids
    // 检查n2节点是否含有:slotted插槽作用域ID。
    // 如果存在，将这些作用域ID与现有的slotScopeIds合并，确保在更新过程中考虑到这些作用域的影响。
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds
        ? slotScopeIds.concat(fragmentSlotScopeIds)
        : fragmentSlotScopeIds
    }
    // 如果n1为null  表明将n2挂载到dom上即可，无需进行对比
    if (n1 == null) {
      // 将片段的起始和结束锚点插入到容器中。
      hostInsert(fragmentStartAnchor, container, anchor)
      hostInsert(fragmentEndAnchor, container, anchor)

      // a fragment can only have array children
      // since they are either generated by the compiler, or implicitly created
      // from arrays.
      // 调用mountChildren函数将其子节点进行对比更新
      mountChildren(
        // #10007
        // such fragment like `<></>` will be compiled into
        // a fragment which doesn't have a children.
        // In this case fallback to an empty array
        // 确保子节点始终是一个数组。如果 n2.children 是 null 或 undefined，将其设置为一个空数组 []。
        (n2.children || []) as VNodeArrayChildren,
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
      )
    } else {

      // 如果n1不为null 则说明需要将两个节点进行对比更新


      if (
        // patchFlag 用于指示 VNode 的更新类型，大于 0 表示可以进行某种形式的优化更新。
        patchFlag > 0 &&
        // 检查 patchFlag 是否为STABLE_FRAGMENT 标志，这个标志用于指示一个片段（Fragment），其子节点的顺序不会改变
        patchFlag & PatchFlags.STABLE_FRAGMENT &&
        // 并且n2存在dynamicChildren即动态子节点
        dynamicChildren &&
        // #2715 the previous fragment could've been a BAILed one as a result
        // of renderSlot() with no valid children
        // 并且旧的 VNode (n1) 也有动态子节点
        n1.dynamicChildren
      ) {
        // a stable fragment (template root or <template v-for>) doesn't need to
        // patch children order, but it may contain dynamicChildren.
        // 用 patchBlockChildren 函数来处理子节点的更新
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
        )
        if (__DEV__) {
          // necessary for HMR
          traverseStaticChildren(n1, n2)
        } else if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          // 在非开发模式下，如果当前 VNode 有键（n2.key != null）或者它是组件的根节点（parentComponent && n2 === parentComponent.subTree），
          // 则调用 traverseStaticChildren 函数来确保所有根级 VNode 继承旧节点的 el。
          // 这是因为这些片段可能会被移动，所以需要确保 DOM 结构的一致性。
          n2.key != null ||
          (parentComponent && n2 === parentComponent.subTree)
        ) {
          traverseStaticChildren(n1, n2, true /* shallow */)
        }
      } else {
        // keyed / unkeyed, or manual fragments.
        // for keyed & unkeyed, since they are compiler generated from v-for,
        // each child is guaranteed to be a block so the fragment will never
        // have dynamicChildren.
        // 对于具有键（keyed）或无键（unkeyed）的片段以及手动创建的片段，由于它们通常是由v-for指令生成的，
        // 所以每个子节点都被认为是块级节点，因此这类片段不会有动态子节点。
        // 调用patchChildren函数来常规地更新子节点，包括重新排列、添加或删除DOM节点等操作，
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
      }
    }
  }
  /**
   * 当组件需要更新或初次渲染时，会调用此函数进行相应操作。
   * @param n1 旧的VNode
   * @param n2 新的VNode
   * @param container 渲染目标容器元素
   * @param anchor 锚点，用于定位新节点在容器中的位置。
   * @param parentComponent 父组件的实例
   * @param parentSuspense 父级Suspense组件实例
   * @param namespace 元素命名空间
   * @param slotScopeIds 作用域插槽ID数组
   * @param optimized 是否启用优化模式
   */
  const processComponent = (
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => {
    // 设置新的VNode的slotScopeIds属性。
    n2.slotScopeIds = slotScopeIds
    // 如果n1（旧VNode）为null
    if (n1 == null) {
      // n2shapeFlag为ShapeFlags.COMPONENT_KEPT_ALIVE标志（组件被keep-alive缓存）
      if (n2.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
        // 调用父组件实例的KeepAliveContext的activate方法，将新VNode加入到keep-alive组件列表，并将其渲染到DOM中。
        ; (parentComponent!.ctx as KeepAliveContext).activate(
          n2,
          container,
          anchor,
          namespace,
          optimized,
        )
      } else {
        // 如果不是被keep-alive缓存的组件，则直接调用mountComponent函数初始化并渲染新组件到DOM。
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          optimized,
        )
      }
    } else {
      // 如果n1不为null，表示需要更新组件，调用updateComponent函数对现有组件进行更新操作。
      updateComponent(n1, n2, optimized)
    }
  }
  /**
   * mountComponent函数负责初始化一个新的组件实例，
   * 并可能进一步设置其属性、插槽和执行setup函数等操作，最终将组件渲染到DOM中。
   * @param initialVNode 初始虚拟节点（VNode），代表要挂载的组件
   * @param container 容器元素，组件将被挂载到这个元素下
   * @param anchor 锚点，用于定位组件在容器中的位置
   * @param parentComponent 父组件实例
   * @param parentSuspense 父级Suspense组件实例
   * @param namespace 命名空间
   * @param optimized 表示是否进行优化。
   */
  const mountComponent: MountComponentFn = (
    initialVNode,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace: ElementNamespace,
    optimized,
  ) => {
    // 2.x compat may pre-create the component instance before actually
    // mounting
    // 判断是否为兼容模式（__COMPAT__），在2.x版本中可能预先创建了组件实例。
    // 如果满足条件，则从initialVNode中获取已存在的组件实例，否则创建一个新的组件实例。
    const compatMountInstance =
      __COMPAT__ && initialVNode.isCompatRoot && initialVNode.component
    // 如果不存在兼容实例，则调用 createComponentInstance 函数创建一个新的组件实例，
    // 并将其存储在 initialVNode.component 中。
    const instance: ComponentInternalInstance =
      compatMountInstance ||
      (initialVNode.component = createComponentInstance(
        initialVNode,
        parentComponent,
        parentSuspense,
      ))

    if (__DEV__ && instance.type.__hmrId) {
      registerHMR(instance)
    }

    if (__DEV__) {
      pushWarningContext(initialVNode)
      startMeasure(instance, `mount`)
    }

    // inject renderer internals for keepAlive
    // 如果该组件是 KeepAlive 组件，则将渲染器内部对象（internals）注入到组件实例的 ctx（上下文）中，
    // 以便 KeepAlive 能够管理和恢复组件的状态。
    if (isKeepAlive(initialVNode)) {
      ; (instance.ctx as KeepAliveContext).renderer = internals
    }

    // resolve props and slots for setup context
    if (!(__COMPAT__ && compatMountInstance)) {
      if (__DEV__) {
        startMeasure(instance, `init`)
      }
      // 如果不在兼容模式下，调用setupComponent函数解析并设置组件实例的props和slots
      setupComponent(instance)
      if (__DEV__) {
        endMeasure(instance, `init`)
      }
    }

    // setup() is async. This component relies on async logic to be resolved
    // before proceeding
    // 如果启用了异步组件功能（__FEATURE_SUSPENSE__），
    // 并且组件实例中存在异步依赖（instance.asyncDep），则执行以下操作：
    if (__FEATURE_SUSPENSE__ && instance.asyncDep) {
      // 如果存在异步依赖，将组件挂载的任务封装成一个渲染效应函数（setupRenderEffect），
      // 注册到Suspense中等待异步依赖解决后再进行渲染。
      parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect)

      // Give it a placeholder if this is not hydration
      // TODO handle self-defined fallback
      // 如果初始虚拟节点没有对应的 DOM 元素（initialVNode.el），
      // 则创建一个占位符虚拟节点（placeholder），并处理其渲染。
      if (!initialVNode.el) {
        const placeholder = (instance.subTree = createVNode(Comment))
        processCommentNode(null, placeholder, container!, anchor)
      }
    } else {
      // 如果不存在异步依赖，立即调用setupRenderEffect函数，
      // 执行组件的实际渲染，即将组件挂载到DOM中对应的位置，
      setupRenderEffect(
        instance,
        initialVNode,
        container,
        anchor,
        parentSuspense,
        namespace,
        optimized,
      )
    }

    if (__DEV__) {
      popWarningContext()
      endMeasure(instance, `mount`)
    }
  }
  /**
   * updateComponent 函数根据新旧 VNode 的差异，以及组件是否是异步的，来决定如何更新组件。
   * 对于需要更新的组件，它会触发组件的重新渲染和 DOM 更新；
   * 对于不需要更新的组件，它会简单地复用现有的 DOM 元素并更新组件实例的 VNode 引用。
   * @param n1  旧的虚拟节点
   * @param n2 新的虚拟节点
   * @param optimized 是否优化
   * @returns 
   */
  const updateComponent = (n1: VNode, n2: VNode, optimized: boolean) => {
    // 获取n1的component赋值给n2和instance
    const instance = (n2.component = n1.component)!
    // 调用shouldUpdateComponent函数判断这个组件是否需要更新。
    // 这通常基于组件的 props、slots、emit 事件等是否发生变化或者新组件是否有runtime directive（运行时指令）或transition（过渡效果）
    if (shouldUpdateComponent(n1, n2, optimized)) {
      // 如果需要更新

      // 组件实例有一个异步依赖（asyncDep）且该依赖尚未解析（!instance.asyncResolved），
      if (
        __FEATURE_SUSPENSE__ &&
        instance.asyncDep &&
        !instance.asyncResolved
      ) {
        // async & still pending - just update props and slots
        // since the component's reactive effect for render isn't set-up yet
        // 则只更新组件的 props 和 slots。这是因为异步加载的组件可能尚未设置reactive effect for render。
        if (__DEV__) {
          pushWarningContext(n2)
        }
        updateComponentPreRender(instance, n2, optimized)
        if (__DEV__) {
          popWarningContext()
        }
        return
      } else {
        // 如果不需要特殊处理（即组件不是异步的，或者异步依赖已经解析），则进行正常的组件更新
        // normal update
        // 将新 VNode（n2）存储在组件实例的 next 属性中，以便在后续的渲染过程中使用。
        instance.next = n2
        // in case the child component is also queued, remove it to avoid
        // double updating the same child component in the same flush.
        // 取消之前的更新任务（如果有的话），以避免在同一个刷新周期内对同一个子组件进行双重更新。
        invalidateJob(instance.update)
        // instance.update is the reactive effect.
        // 直接将effect.dirty 设为 true，表明重新运行副作用函数
        instance.effect.dirty = true
        // 调用组件在update函数进行更新操作，这个update函数在setupRenderEffect函数内被绑定到组件实例上
        instance.update()
      }
    } else {
      // no update needed. just copy over properties
      // 这个不需要更新只要复用el元素
      n2.el = n1.el
      // 在将组件实例的vnode指向新虚拟节点(n2)即可
      instance.vnode = n2
    }
  }
  /**
   * 创建一个响应式的效果（reactive effect），并将其绑定到组件实例上,该效果会在组件的依赖项发生变化时触发组件的重新渲染。
   * @param instance 组件实例
   * @param initialVNode 初始虚拟节点
   * @param container 容器元素 
   * @param anchor 锚点元素
   * @param parentSuspense 父级Suspense对象实例
   * @param namespace 命名空间
   * @param optimized 是否优化
   */
  const setupRenderEffect: SetupRenderEffectFn = (
    instance,
    initialVNode,
    container,
    anchor,
    parentSuspense,
    namespace: ElementNamespace,
    optimized,
  ) => {
    const componentUpdateFn = () => {
      // 检查组件是否已经挂载：
      if (!instance.isMounted) {
        // 表示组件还没被挂载
        let vnodeHook: VNodeHook | null | undefined
        // 这里从初始虚拟节点 initialVNode 中提取了 el（关联的 DOM 元素）和 props（属性）
        const { el, props } = initialVNode
        // 从组件实例 instance 中提取了 beforeMount（bm）和 mount（m）钩子函数，以及父组件实例 parent
        const { bm, m, parent } = instance
        // 通过 isAsyncWrapper 函数检查了初始虚拟节点是否是一个异步包装器节点。
        const isAsyncWrapperVNode = isAsyncWrapper(initialVNode)
        // 禁用了组件的递归更新
        toggleRecurse(instance, false)

        // 触发beforeMount钩子函数
        // beforeMount hook
        if (bm) {
          invokeArrayFns(bm)
        }

        // 如果初始虚拟节点不是异步包装器，并且存在 onVnodeBeforeMount 钩子，也会调用它。
        // onVnodeBeforeMount
        if (
          !isAsyncWrapperVNode &&
          (vnodeHook = props && props.onVnodeBeforeMount)
        ) {
          invokeVNodeHook(vnodeHook, parent, initialVNode)
        }
        // 接着，如果启用了兼容性模式，并且允许实例事件钩子，会触发 hook:beforeMount 事件。
        if (
          __COMPAT__ &&
          isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
        ) {
          instance.emit('hook:beforeMount')
        }
        // 最后，重新启用组件的递归更新（toggleRecurse(instance, true)）。
        toggleRecurse(instance, true)
        // 以下是ssr相关的代码
        if (el && hydrateNode) {
          // 这是将服务器渲染的节点“激活”为客户端可交互的组件的过程。
          // vnode has adopted host node - perform hydration instead of mount.
          const hydrateSubTree = () => {
            if (__DEV__) {
              startMeasure(instance, `render`)
            }
            instance.subTree = renderComponentRoot(instance)
            if (__DEV__) {
              endMeasure(instance, `render`)
            }
            if (__DEV__) {
              startMeasure(instance, `hydrate`)
            }
            hydrateNode!(
              el as Node,
              instance.subTree,
              instance,
              parentSuspense,
              null,
            )
            if (__DEV__) {
              endMeasure(instance, `hydrate`)
            }
          }

          if (isAsyncWrapperVNode) {
            ; (initialVNode.type as ComponentOptions).__asyncLoader!().then(
              // note: we are moving the render call into an async callback,
              // which means it won't track dependencies - but it's ok because
              // a server-rendered async wrapper is already in resolved state
              // and it will never need to change.
              () => !instance.isUnmounted && hydrateSubTree(),
            )
          } else {
            hydrateSubTree()
          }
        } else {
          if (__DEV__) {
            startMeasure(instance, `render`)
          }
          // 调用renderComponentRoot生成组件的子树
          const subTree = (instance.subTree = renderComponentRoot(instance))
          if (__DEV__) {
            endMeasure(instance, `render`)
          }
          if (__DEV__) {
            startMeasure(instance, `patch`)
          }
          // 调用patch函数将子树渲染到DOM中
          patch(
            null,
            subTree,
            container,
            anchor,
            instance,
            parentSuspense,
            namespace,
          )
          if (__DEV__) {
            endMeasure(instance, `patch`)
          }
          // 将子树的el对象赋值给初始虚拟节点的el
          initialVNode.el = subTree.el
        }
        // mounted hook
        // 组件挂载完成后，执行mounted钩子函数（如果存在）
        if (m) {
          queuePostRenderEffect(m, parentSuspense)
        }
        // onVnodeMounted
        // 执行onVnodeMounted钩子函数（如果存在）
        if (
          !isAsyncWrapperVNode &&
          (vnodeHook = props && props.onVnodeMounted)
        ) {
          const scopedInitialVNode = initialVNode
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook!, parent, scopedInitialVNode),
            parentSuspense,
          )
        }
        // 在兼容模式下，触发hook:mounted钩子
        if (
          __COMPAT__ &&
          isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
        ) {
          queuePostRenderEffect(
            () => instance.emit('hook:mounted'),
            parentSuspense,
          )
        }

        // activated hook for keep-alive roots.
        // #1742 activated hook must be accessed after first render
        // since the hook may be injected by a child keep-alive
        // 如果组件满足ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE条件（即组件被<keep-alive>包裹），
        // 则执行activated钩子函数（如果存在）。
        if (
          initialVNode.shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE ||
          (parent &&
            isAsyncWrapper(parent.vnode) &&
            parent.vnode.shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE)
        ) {
          instance.a && queuePostRenderEffect(instance.a, parentSuspense)
          // 处理兼容模式下的hook:activated钩子
          if (
            __COMPAT__ &&
            isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
          ) {
            queuePostRenderEffect(
              () => instance.emit('hook:activated'),
              parentSuspense,
            )
          }
        }
        // 设置为true表示组件已经挂载到dom上了
        instance.isMounted = true

        if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
          devtoolsComponentAdded(instance)
        }

        // #2458: deference mount-only object parameters to prevent memleaks
        // 并释放一些临时变量以防止内存泄漏
        initialVNode = container = anchor = null as any
      } else {
        // 获取组件实例instance的一些关键属性
        // next(来自父组件更新的待处理新VNode)
        // bu（beforeUpdate钩子函数列表）、u（updated钩子函数）、父级组件以及当前虚拟节点vnode。
        let { next, bu, u, parent, vnode } = instance

        // 这一段代码主要涉及异步组件更新和Suspense特性。patch函数在这里处理来自父组件更新的待处理新VNode，
        // 并根据是否有异步组件还未完成hydration（即客户端对服务端渲染结果的合并）进行不同操作。

        // 如果启用了Suspense特性
        if (__FEATURE_SUSPENSE__) {
          // 先查找当前实例是否存在未完成hydration的异步根组件。
          const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance)
          // we are trying to update some async comp before hydration
          // this will cause crash because we don't know the root node yet
          // 如果找到这样一个非hydrated的异步根组件
          if (nonHydratedAsyncRoot) {
            // only sync the properties and abort the rest of operations
            if (next) {
              // 如果存在next（新的VNode），则将next的DOM元素引用指向当前vnode的DOM元素，
              // 并调用updateComponentPreRender函数提前做一些更新前的准备工作。
              next.el = vnode.el
              updateComponentPreRender(instance, next, optimized)
            }
            // and continue the rest of operations once the deps are resolved
            // 等待异步依赖（`asyncDep`）解析完成后，

            nonHydratedAsyncRoot.asyncDep!.then(() => {
              // the instance may be destroyed during the time period
              //这里还检查组件是否已经被卸载（isUnmounted），
              if (!instance.isUnmounted) {
                //  再执行 componentUpdateFn 函数来完成组件的更新。
                componentUpdateFn()
              }
            })
            return
          }
        }

        // updateComponent
        // This is triggered by mutation of component's own state (next: null)
        // OR parent calling processComponent (next: VNode)
        // 如果是因为组件自身状态的改变触发的updateComponent，此时next可能是null。
        // 当由父组件调用processComponent方法触发更新时next会是一个有效的VNode对象。
        let originNext = next
        let vnodeHook: VNodeHook | null | undefined
        if (__DEV__) {
          pushWarningContext(next || instance.vnode)
        }

        // Disallow component effect recursion during pre-lifecycle hooks.
        // 组件在执行预生命周期钩子时（例如beforeUpdate或beforeMount），通常会限制组件内部的副作用（effect）在这些阶段发生递归更新。
        // 这是因为在这个阶段，组件应该专注于准备自身的更新逻辑，而不是立即触发额外的更新循环
        toggleRecurse(instance, false)
        if (next) {
          // 如果 next 存在，则将其 el 属性设置为当前 VNode 的 el，
          next.el = vnode.el
          // 并调用updateComponentPreRender函数来处理组件的预渲染阶段，比如更新props和slots和执行需要在dom更新前触发的job。
          updateComponentPreRender(instance, next, optimized)
        } else {
          // 如果 next 不存在，则将其设置为当前的 vnode
          next = vnode
        }

        // beforeUpdate hook
        // 触发beforeUpdate构子
        if (bu) {
          invokeArrayFns(bu)
        }
        // onVnodeBeforeUpdate
        // 执行 onVnodeBeforeUpdate 钩子
        if ((vnodeHook = next.props && next.props.onVnodeBeforeUpdate)) {
          invokeVNodeHook(vnodeHook, parent, next, vnode)
        }
        // 如果启用了兼容性模式（__COMPAT__ 为 true），并且该实例启用了实例事件钩子的兼容性，则触发beforeUpdate构子。

        if (
          __COMPAT__ &&
          isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
        ) {
          instance.emit('hook:beforeUpdate')
        }
        // 重新启用组件内部的递归
        toggleRecurse(instance, true)

        // render
        if (__DEV__) {
          startMeasure(instance, `render`)
        }
        // 调用renderComponentRoot函数生成新的虚拟DOM树（nextTree）
        const nextTree = renderComponentRoot(instance)
        if (__DEV__) {
          endMeasure(instance, `render`)
        }
        // 保存旧的子树结构到 prevTree，并将新的子树结构设置为 nextTree。
        const prevTree = instance.subTree
        instance.subTree = nextTree

        if (__DEV__) {
          startMeasure(instance, `patch`)
        }
        // 调用 patch 函数将旧树(prevTree)和新树(nextTree)来进行对比更新
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport
          hostParentNode(prevTree.el!)!,
          // anchor may have changed if it's in a fragment
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          namespace,
        )
        if (__DEV__) {
          endMeasure(instance, `patch`)
        }
        // 将新生成的虚拟DOM树（nextTree）的DOM元素引用赋给next.el。
        // 这样做是因为在更新过程中，我们需要保持对最新DOM元素的引用。
        next.el = nextTree.el
        // 判断originNext是否为空
        if (originNext === null) {
          // self-triggered update. In case of HOC, update parent component
          // vnode el. HOC is indicated by parent instance's subTree pointing
          // to child component's vnode
          // 如果为空，则认为这次更新是由组件自身触发的（self-triggered update）。
          // 在这种情况下，特别是在高阶组件（HOC）场景下，
          // 需要调用updateHOCHostEl函数更新父组件中指向子组件VNode的DOM元素引用。
          updateHOCHostEl(instance, nextTree.el)
        }
        // updated hook
        // 触发updated构子
        if (u) {
          queuePostRenderEffect(u, parentSuspense)
        }
        // onVnodeUpdated
        // 触发onVnodeUpdated构子
        if ((vnodeHook = next.props && next.props.onVnodeUpdated)) {
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook!, parent, next!, vnode),
            parentSuspense,
          )
        }
        // 兼容模式下使用emit('hook:updated')方式触发updated构子
        if (
          __COMPAT__ &&
          isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
        ) {
          queuePostRenderEffect(
            () => instance.emit('hook:updated'),
            parentSuspense,
          )
        }

        if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
          devtoolsComponentUpdated(instance)
        }

        if (__DEV__) {
          popWarningContext()
        }
      }
    }

    // create reactive effect for rendering
    // 创建了一个用于组件渲染的响应式effct对象
    const effect = (instance.effect = new ReactiveEffect(
      componentUpdateFn, // 组件更新函数，当响应式数据变化时，这个函数会被调用以重新渲染组件。
      NOOP, // trigger函数为空函数
      () => queueJob(update), //调度器函数，它将更新任务(update)加入到任务队列中
      instance.scope, // track it in component's effect scope
      // effect作用域，以便于跟踪组件内的所有effect。
    ))

    // 定义了一个调度器任务，用于在响应式数据改变时触发组件的重新渲染。
    const update: SchedulerJob = (instance.update = () => {
      // 当effect.dirty为真时，表示响应式依赖发生了变化，
      if (effect.dirty) {
        // 调用effect.run()来运行componentUpdateFn，从而更新组件视图。
        effect.run()
      }
    })
    //update job的id 指定为 instance.uid
    // 后续执行update job是有可能会拿instance.uid进行比较
    update.id = instance.uid
    // allowRecurse
    // #1801, #2043 component render effects should allow recursive updates
    // 通过toggleRecurse(instance, true)确保在组件渲染期间能够处理递归更新。
    toggleRecurse(instance, true)

    if (__DEV__) {
      effect.onTrack = instance.rtc
        ? e => invokeArrayFns(instance.rtc!, e)
        : void 0
      effect.onTrigger = instance.rtg
        ? e => invokeArrayFns(instance.rtg!, e)
        : void 0
      update.ownerInstance = instance
    }
    // 调用update()函数启动第一次组件渲染。
    update()
  }

  /**
   * pdateComponentPreRender函数，用于在组件渲染之前更新组件的属性和插槽。以及调用需要在DOM更新前执行的任务队列
   * @param instance 当前组件的内部实例
   * @param nextVNode  即将更新的虚拟节点（VNode），代表了组件新的状态和属性。
   * @param optimized 优化选项
   */
  const updateComponentPreRender = (
    instance: ComponentInternalInstance,
    nextVNode: VNode,
    optimized: boolean,
  ) => {
    // 将组件实例与新的虚拟节点关联起来，这样可以通过虚拟节点访问组件实例
    nextVNode.component = instance
    // 保存当前虚拟节点的属性，以便与新的属性进行比较和更新。
    const prevProps = instance.vnode.props
    // 组件实例的vnode属性更新为新的虚拟节点
    instance.vnode = nextVNode
    // 重置 next 属性
    instance.next = null
    // 调用updateProps函数，比较并更新组件实例的props属性，依据新旧props和优化标志进行操作
    updateProps(instance, nextVNode.props, prevProps, optimized)
    // 调用updateSlots函数，处理并更新组件的插槽内容，同样根据优化标志来决定是否进行优化
    updateSlots(instance, nextVNode.children, optimized)
    // 调用pauseTracking暂停依赖收集,这确保了在执行更新期间不会收集新的依赖
    pauseTracking()
    // props update may have triggered pre-flush watchers.
    // flush them before the render update.
    // 调用flushPreFlushCbs函数，执行所有需要在更新之前(pre)触发的回调
    flushPreFlushCbs(instance)
    // 重置resetTracking依赖收集
    resetTracking()
  }
  /**
   * 比较并更新新旧VNode节点中的子节点
   * @param n1 旧虚拟节点
   * @param n2 新虚拟节点
   * @param container 容器元素
   * @param anchor 锚点元素
   * @param parentComponent 父组件
   * @param parentSuspense 父组件Suspense对象
   * @param namespace 命名空间
   * @param slotScopeIds 插槽作用域id数组
   * @param optimized 优化标志
   * @returns 
   */
  const patchChildren: PatchChildrenFn = (
    n1,
    n2,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace: ElementNamespace,
    slotScopeIds,
    optimized = false,
  ) => {
    // 保存n1的子节点
    const c1 = n1 && n1.children
    // 设置如果n1存在，设置为n1的shapeFlag,否则为0,0不在ShapeFlag枚举中
    const prevShapeFlag = n1 ? n1.shapeFlag : 0
    // n2的子节点
    const c2 = n2.children

    const { patchFlag, shapeFlag } = n2

    // fast path
    // 如果大于0表明在编译时就确定如何进行更新操作
    if (patchFlag > 0) {
      // 如果patchFlag为 PatchFlags.KEYED_FRAGMENT
      if (patchFlag & PatchFlags.KEYED_FRAGMENT) {
        // this could be either fully-keyed or mixed (some keyed some not)
        // presence of patchFlag means children are guaranteed to be arrays
        // 当patchFlag为PatchFlags.KEYED_FRAGMENT时，意味着可以确保子节点一定是数组形式。
        // 这种情况下的子节点可以是全部键控（fully-keyed，即每个子节点都有一个唯一的键值key）或是混合型（mixed，即部分子节点有键值，部分没有）。
        // 调用 patchKeyedChildren 来更新带有 key 的子节点。
        patchKeyedChildren(
          c1 as VNode[],
          c2 as VNodeArrayChildren,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
        return
      } else if (patchFlag & PatchFlags.UNKEYED_FRAGMENT) {
        // unkeyed
        // 则调用 patchUnkeyedChildren 来更新没有 key 的子节点。
        patchUnkeyedChildren(
          c1 as VNode[],
          c2 as VNodeArrayChildren,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
        return
      }
    }

    // children has 3 possibilities: text, array or no children.
    // 子节点可以是文本、数组或就不存在子节点
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      // text children fast path
      // 如果shapeFlag为ShapeFlags.TEXT_CHILDREN ，则执行与文本子节点相关的逻辑。
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 如果旧子节点是数组，就先卸载掉它们。
        unmountChildren(c1 as VNode[], parentComponent, parentSuspense)
      }
      // 如果新节点不等于旧节点,则执行文本更新操作
      if (c2 !== c1) {
        hostSetElementText(container, c2 as string)
      }
    } else {
      // 如果旧子节点是数组
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // prev children was array
        // 新的子节点也是数组
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // two arrays, cannot assume anything, do full diff
          // 则调用patchKeyedChildren函数执行完整的 diff 更新
          patchKeyedChildren(
            c1 as VNode[],
            c2 as VNodeArrayChildren,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        } else {
          // no new children, just unmount old
          // 如果没有新的子节点，则卸载旧的子节点。
          unmountChildren(c1 as VNode[], parentComponent, parentSuspense, true)
        }
      } else {
        // prev children was text OR null
        // 旧子节点（c1）是文本或者不存在（null）
        // new children is array OR null
        // 而新子节点（c2）是数组或者也不存在
        // 如果旧节点是一个文本节点，清空该文本节点的内容
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          hostSetElementText(container, '')
        }
        // mount new if array
        // 新子节点的 是一个数组，调用mountChildren函数挂载这些新的子节点
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          mountChildren(
            c2 as VNodeArrayChildren,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        }
      }
    }
  }

  /**
   * patchUnkeyedChildren 函数用于处理没有 key 的子节点对比更新。
   * @param c1 旧的子节点数组
   * @param c2 新的子节点数组
   * @param container DOM容器元素，也就是这些子节点的父元素
   * @param anchor  锚点元素，用于将新节点插入anchor的前一个位置
   * @param parentComponent 父组件
   * @param parentSuspense 父级Suspense实例
   * @param namespace 命名空间
   * @param slotScopeIds 插槽作用域 ID 数组
   * @param optimized 是否优化
   */
  const patchUnkeyedChildren = (
    c1: VNode[],
    c2: VNodeArrayChildren,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => {
    // 首先，确保 c1 和 c2 都不是 null 或 undefined，如果不是数组则使用空数组 EMPTY_ARR
    c1 = c1 || EMPTY_ARR
    c2 = c2 || EMPTY_ARR

    const oldLength = c1.length
    const newLength = c2.length
    // 获取两则之间的最小值
    const commonLength = Math.min(oldLength, newLength)
    let i
    // 遍历两个数组中长度较小的那个，对每一个索引 i 下的子节点进行 patch 操作
    for (i = 0; i < commonLength; i++) {
      // 根据优化标志决定是否克隆已挂载的VNode或对其进行标准化处理。
      const nextChild = (c2[i] = optimized
        ? cloneIfMounted(c2[i] as VNode)
        : normalizeVNode(c2[i]))
      // 调用patch函数对旧VNode和新VNode进行对比和更新
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
      )
    }
    // 如果旧的子节点多于新的子节点数量
    if (oldLength > newLength) {
      // remove old
      // 说明有些旧的子节点在新数组中不再存在，调用unmountChildren函数卸载这些多余的旧子节点。
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength,
      )
    } else {
      // 如果新数组c2的长度大于旧数组c1，说明有新的子节点需要添加，调用mountChildren函数将新子节点挂载到DOM中。
      // mount new
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        commonLength,
      )
    }
  }


  // can be all-keyed or mixed
  /**
   * patchKeyedChildren函数用来对比并更新有key属性的子节点。它接收两组虚拟VNode数组（c1和c2），
   * 并根据键值对它们进行同步、挂载、卸载和移动操作，以确保DOM结构与新的虚拟DOM树一致。
   * @param c1  旧的子节点数组
   * @param c2 新的子节点数组
   * @param container dom容器，即子节点的父元素
   * @param parentAnchor 父的锚点元素
   * @param parentComponent 父组件实例
   * @param parentSuspense 父级的 Suspense实例
   * @param namespace 命名空间
   * @param slotScopeIds 插槽作用域数组
   * @param optimized 是否优化
   */
  const patchKeyedChildren = (
    c1: VNode[],
    c2: VNodeArrayChildren,
    container: RendererElement,
    parentAnchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => {
    let i = 0
    const l2 = c2.length
    let e1 = c1.length - 1 // prev ending index
    let e2 = l2 - 1 // next ending index

    // 1. sync from start
    // (a b) c
    // (a b) d e
    // 从两个数组的起点开始，逐个比较节点。
    // 通过 isSameVNodeType 函数判断节点类型相同是否相同，
    // 如果相同则调用patch 函数操作进行对比更新节点；如果类型不同，则跳出循环。
    while (i <= e1 && i <= e2) {
      const n1 = c1[i]
      const n2 = (c2[i] = optimized
        ? cloneIfMounted(c2[i] as VNode)
        : normalizeVNode(c2[i]))
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
      } else {
        break
      }
      i++
    }

    // 2. sync from end
    // a (b c)
    // d e (b c)
    // 从两个数组的末尾开始，逐个比较节点。
    // 如果节点类型相同，则调用 patch函数 进行对比更新节点；如果类型不同，则跳出循环。
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1]
      const n2 = (c2[e2] = optimized
        ? cloneIfMounted(c2[e2] as VNode)
        : normalizeVNode(c2[e2]))
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
      } else {
        break
      }
      e1--
      e2--
    }

    // 3. common sequence + mount
    // (a b)
    // (a b) c
    // i = 2, e1 = 1, e2 = 2
    // (a b)
    // c (a b)
    // i = 0, e1 = -1, e2 = 0
    // 如果旧数组的终点索引小于新数组的终点索引，说明有新节点需要插入。遍历这些新节点，并在 DOM 中插入它们。
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1
        const anchor = nextPos < l2 ? (c2[nextPos] as VNode).el : parentAnchor
        while (i <= e2) {
          patch(
            null,
            (c2[i] = optimized
              ? cloneIfMounted(c2[i] as VNode)
              : normalizeVNode(c2[i])),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
          i++
        }
      }
    }

    // 4. common sequence + unmount
    // (a b) c
    // (a b)
    // i = 2, e1 = 2, e2 = 1
    // a (b c)
    // (b c)
    // i = 0, e1 = 0, e2 = -1
    // 如果新数组的终点索引小于旧数组的终点索引，说明有旧节点需要被移除。
    // 遍历这些旧节点，并在 DOM 中卸载它们。
    else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true)
        i++
      }
    }

    // 5. unknown sequence
    // [i ... e1 + 1]: a b [c d e] f g
    // [i ... e2 + 1]: a b [e d c h] f g
    // i = 2, e1 = 4, e2 = 5
    // 在 unknown sequence这部分，两组VNode子节点数组它们的顺序发生了变化，
    // 且不能直接通过简单的同步方式进行更新。
    else {
      const s1 = i // prev starting index
      const s2 = i // next starting index

      // 5.1 build key:index map for newChildren
      // 首先，建立一个keyToNewIndexMap映射表，用于存储新子节点（c2）中每个带key的节点及其在新数组中的索引。
      const keyToNewIndexMap: Map<string | number | symbol, number> = new Map()
      for (i = s2; i <= e2; i++) {
        const nextChild = (c2[i] = optimized
          ? cloneIfMounted(c2[i] as VNode)
          : normalizeVNode(c2[i]))
        if (nextChild.key != null) {
          // 如果在开发环境中检测到重复的key，会发出警告提示开发者key应保持唯一。
          if (__DEV__ && keyToNewIndexMap.has(nextChild.key)) {
            warn(
              `Duplicate keys found during update:`,
              JSON.stringify(nextChild.key),
              `Make sure keys are unique.`,
            )
          }
          keyToNewIndexMap.set(nextChild.key, i)
        }
      }

      // 5.2 loop through old children left to be patched and try to patch
      // matching nodes & remove nodes that are no longer present
      let j
      let patched = 0 //已处理的（或者说是已经patch的）节点数
      const toBePatched = e2 - s2 + 1 // 需要被处理的新子节点数
      let moved = false // 标记是否有节点移动。
      // used to track whether any node has moved
      let maxNewIndexSoFar = 0 // 用于存储到目前为止处理过的所有新节点中索引最大的那个
      // works as Map<newIndex, oldIndex>
      // Note that oldIndex is offset by +1
      // and oldIndex = 0 is a special value indicating the new node has
      // no corresponding old node.
      // used for determining longest stable subsequence
      // 用于建立新子节点索引（newIndex）到旧子节点索引（oldIndex）的映射关系。这个映射关系在后续确定最长稳定子序列(longest stable subsequence)以及执行节点移动和更新时非常有用。
      // 需要注意的是，这里的 oldIndex 是偏移了 +1 的，即如果新节点在旧节点列表中的对应位置是 i，则在 newIndexToOldIndexMap 中存储的值将是 i + 1。特殊值 0 表示新节点在旧节点列表中没有对应的节点。
      const newIndexToOldIndexMap = new Array(toBePatched) // 组用于记录新旧节点间的映射关系
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0 // 这个数组的长度是toBePatched，并且初始化为0。

      for (i = s1; i <= e1; i++) {

        const prevChild = c1[i]
        // 如果已经处理的新子节点数（patched）大于或等于需要被处理的新子节点数（toBePatched），
        // 说明当前旧子节点在新子节点列表中不存在，需要被卸载（unmount）。
        if (patched >= toBePatched) {
          // all new children have been patched so this can only be a removal
          unmount(prevChild, parentComponent, parentSuspense, true)
          continue
        }
        let newIndex
        if (prevChild.key != null) {
          // 获取旧节点的键值，如果存在，则从keyToNewIndexMap中查找对应的新节点索引
          newIndex = keyToNewIndexMap.get(prevChild.key)
        } else {
          // key-less node, try to locate a key-less node of the same type
          // 如果旧节点没有键值，则在新子节点数组中查找相同类型的节点（通过isSameVNodeType函数判断）
          for (j = s2; j <= e2; j++) {
            if (
              newIndexToOldIndexMap[j - s2] === 0 &&
              isSameVNodeType(prevChild, c2[j] as VNode)
            ) {
              newIndex = j
              break
            }
          }
        }
        if (newIndex === undefined) {
          // 如果没有找到匹配的新节点，则卸载当前旧节点。
          unmount(prevChild, parentComponent, parentSuspense, true)
        } else {
          // 如果找到了新节点的索引（newIndex不为undefined）

          // 更新newIndexToOldIndexMap，记录新旧节点的映射关系。
          newIndexToOldIndexMap[newIndex - s2] = i + 1

          // 根据newIndex更新maxNewIndexSoFar，并判断是否发生节点移动（moved）
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex
          } else {
            moved = true
          }
          // 使用patch函数对找到的新旧节点进行对比进行差异化更新操作，
          patch(
            prevChild,
            c2[newIndex] as VNode,
            container,
            null,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
          // 并增加patched计数。
          patched++
        }
      }

      // 5.3 move and mount
      // generate longest stable subsequence only when nodes have moved
      // 如果节点有移动（moved 为 true），则通过调用 getSequence(newIndexToOldIndexMap) 生成最长稳定子序列。
      // 这个序列包含了在新旧子节点列表中位置都没有发生变化的节点索引
      const increasingNewIndexSequence = moved
        ? getSequence(newIndexToOldIndexMap)
        : EMPTY_ARR
      j = increasingNewIndexSequence.length - 1
      // looping backwards so that we can use last patched node as anchor
      // 从最后一个新子节点开始向前遍历（for 循环从 toBePatched - 1 到 0）。
      // 这样做是为了能够使用最后一个已处理的节点作为锚点（anchor），以便进行高效的DOM操作。
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i
        const nextChild = c2[nextIndex] as VNode
        // 对于每个新子节点 nextChild，首先确定其锚点 anchor。如果 nextChild 不是最后一个子节点，
        // 则使用其后一个兄弟节点作为锚点；否则，使用传入的 parentAnchor。
        const anchor =
          nextIndex + 1 < l2 ? (c2[nextIndex + 1] as VNode).el : parentAnchor

        if (newIndexToOldIndexMap[i] === 0) {
          // mount new
          // 如果newIndexToOldIndexMap表明当前新节点没有对应的旧节点（值为0），
          // 说明这是一个新插入的节点，调用patch方法将其挂载到DOM上
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        } else if (moved) {
          // 若节点发生了移动
          // move if:
          // There is no stable subsequence (e.g. a reverse)
          // OR current node is not among the stable sequence
          // 如果当前没有稳定子序列可供参考（j < 0）或检查当前节点不在稳定子序列中（通过与increasingNewIndexSequence进行比较）；
          if (j < 0 || i !== increasingNewIndexSequence[j]) {

            // 则调用 move 函数将节点移动到正确的位置。这里使用的是 MoveType.REORDER，表示这是一个重新排序的移动操作。
            move(nextChild, container, anchor, MoveType.REORDER)
          } else {
            // 如果当前节点在稳定子序列中，则递减 j 以继续检查下一个节点是否也在稳定子序列中。稳定子序列中的节点不需要移动，因为它们在DOM中的位置已经是正确的。
            j--
          }
        }
      }
    }
  }
  /**
   * 用于移动DOM元素
   * @param vnode  要移动的虚拟节点
   * @param container  新的目标容器元素
   * @param anchor 锚点元素
   * @param moveType 移动类型
   * @param parentSuspense 父级Suspense实例
   * @returns 
   */
  const move: MoveFn = (
    vnode,
    container,
    anchor,
    moveType,
    parentSuspense = null,
  ) => {
    const { el, type, transition, children, shapeFlag } = vnode
    // 如果虚拟节点是一个组件
    if (shapeFlag & ShapeFlags.COMPONENT) {
      // 则递归地调用 move 函数来处理该组件的子树。
      move(vnode.component!.subTree, container, anchor, moveType)
      return
    }
    // 如果虚拟节点是一个Suspense节点
    if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
      // 则调用Suspense实例上的 move 方法来处理移动。悬念通常用于异步组件加载时提供回退内容，并在内容加载完成后切换到实际内容。
      vnode.suspense!.move(container, anchor, moveType)
      return
    }

    // 如果虚拟节点是一个Teleport节点
    if (shapeFlag & ShapeFlags.TELEPORT) {
      // 则调用Teleport实例上的 move 方法。传送允许将子节点渲染到DOM树中的不同位置，而不是在它们的父节点内部
      ; (type as typeof TeleportImpl).move(vnode, container, anchor, internals)
      return
    }
    // 如果虚拟节点的类型是Fragment
    if (type === Fragment) {
      // 则首先将Fragment的根元素插入到容器中，
      hostInsert(el!, container, anchor)
      // 遍历其所有子节点并逐个移动
      for (let i = 0; i < (children as VNode[]).length; i++) {
        move((children as VNode[])[i], container, anchor, moveType)
      }
      // 最后插入虚拟节点的锚点元素
      hostInsert(vnode.anchor!, container, anchor)
      return
    }

    // 如果虚拟节点的类型是静态的（Static）
    if (type === Static) {
      // 则调用 moveStaticNode 函数来移动该静态节点。
      // 静态节点是指其内容在渲染之间不会改变的节点，因此它们的移动可以优化以提高性能。
      moveStaticNode(vnode, container, anchor)
      return
    }

    // 针对常规的元素节点（Element类型），如果存在过渡效果并且不是重新排序的情况，则执行过渡动画
    // single nodes
    const needTransition =
      moveType !== MoveType.REORDER &&
      shapeFlag & ShapeFlags.ELEMENT &&
      transition
    if (needTransition) {
      // 如果moveType是MoveType.ENTER，先调用transition.beforeEnter，
      // 然后插入节点，最后调度后渲染效果函数执行transition.enter。
      if (moveType === MoveType.ENTER) {
        transition!.beforeEnter(el!)
        hostInsert(el!, container, anchor)
        queuePostRenderEffect(() => transition!.enter(el!), parentSuspense)
      } else {
        // 对于非进入过渡，先调用leave方法开始离开动画，并在动画结束后调用afterLeave，
        const { leave, delayLeave, afterLeave } = transition!
        const remove = () => hostInsert(el!, container, anchor)
        const performLeave = () => {
          leave(el!, () => {
            remove()
            afterLeave && afterLeave()
          })
        }
        // 如果存在delayLeave，则表示需要延迟leave
        if (delayLeave) {
          delayLeave(el!, remove, performLeave)
        } else {
          // 否则直接执行performLeave
          performLeave()
        }
      }
    } else {
      // 若无过渡效果，或者不适用过渡的情况，直接使用hostInsert方法将节点插入到目标容器和锚点之间
      hostInsert(el!, container, anchor)
    }
  }

  const unmount: UnmountFn = (
    vnode,
    parentComponent,
    parentSuspense,
    doRemove = false,
    optimized = false,
  ) => {
    const {
      type,
      props,
      ref,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs,
    } = vnode
    // unset ref
    if (ref != null) {
      setRef(ref, null, parentSuspense, vnode, true)
    }

    if (shapeFlag & ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE) {
      ; (parentComponent!.ctx as KeepAliveContext).deactivate(vnode)
      return
    }

    const shouldInvokeDirs = shapeFlag & ShapeFlags.ELEMENT && dirs
    const shouldInvokeVnodeHook = !isAsyncWrapper(vnode)

    let vnodeHook: VNodeHook | undefined | null
    if (
      shouldInvokeVnodeHook &&
      (vnodeHook = props && props.onVnodeBeforeUnmount)
    ) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode)
    }

    if (shapeFlag & ShapeFlags.COMPONENT) {
      unmountComponent(vnode.component!, parentSuspense, doRemove)
    } else {
      if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
        vnode.suspense!.unmount(parentSuspense, doRemove)
        return
      }

      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'beforeUnmount')
      }

      if (shapeFlag & ShapeFlags.TELEPORT) {
        ; (vnode.type as typeof TeleportImpl).remove(
          vnode,
          parentComponent,
          parentSuspense,
          optimized,
          internals,
          doRemove,
        )
      } else if (
        dynamicChildren &&
        // #1153: fast path should not be taken for non-stable (v-for) fragments
        (type !== Fragment ||
          (patchFlag > 0 && patchFlag & PatchFlags.STABLE_FRAGMENT))
      ) {
        // fast path for block nodes: only need to unmount dynamic children.
        unmountChildren(
          dynamicChildren,
          parentComponent,
          parentSuspense,
          false,
          true,
        )
      } else if (
        (type === Fragment &&
          patchFlag &
          (PatchFlags.KEYED_FRAGMENT | PatchFlags.UNKEYED_FRAGMENT)) ||
        (!optimized && shapeFlag & ShapeFlags.ARRAY_CHILDREN)
      ) {
        unmountChildren(children as VNode[], parentComponent, parentSuspense)
      }

      if (doRemove) {
        remove(vnode)
      }
    }

    if (
      (shouldInvokeVnodeHook &&
        (vnodeHook = props && props.onVnodeUnmounted)) ||
      shouldInvokeDirs
    ) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode)
        shouldInvokeDirs &&
          invokeDirectiveHook(vnode, null, parentComponent, 'unmounted')
      }, parentSuspense)
    }
  }

  const remove: RemoveFn = vnode => {
    const { type, el, anchor, transition } = vnode
    if (type === Fragment) {
      if (
        __DEV__ &&
        vnode.patchFlag > 0 &&
        vnode.patchFlag & PatchFlags.DEV_ROOT_FRAGMENT &&
        transition &&
        !transition.persisted
      ) {
        ; (vnode.children as VNode[]).forEach(child => {
          if (child.type === Comment) {
            hostRemove(child.el!)
          } else {
            remove(child)
          }
        })
      } else {
        removeFragment(el!, anchor!)
      }
      return
    }

    if (type === Static) {
      removeStaticNode(vnode)
      return
    }

    const performRemove = () => {
      hostRemove(el!)
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave()
      }
    }

    if (
      vnode.shapeFlag & ShapeFlags.ELEMENT &&
      transition &&
      !transition.persisted
    ) {
      const { leave, delayLeave } = transition
      const performLeave = () => leave(el!, performRemove)
      if (delayLeave) {
        delayLeave(vnode.el!, performRemove, performLeave)
      } else {
        performLeave()
      }
    } else {
      performRemove()
    }
  }

  const removeFragment = (cur: RendererNode, end: RendererNode) => {
    // For fragments, directly remove all contained DOM nodes.
    // (fragment child nodes cannot have transition)
    let next
    while (cur !== end) {
      next = hostNextSibling(cur)!
      hostRemove(cur)
      cur = next
    }
    hostRemove(end)
  }

  const unmountComponent = (
    instance: ComponentInternalInstance,
    parentSuspense: SuspenseBoundary | null,
    doRemove?: boolean,
  ) => {
    if (__DEV__ && instance.type.__hmrId) {
      unregisterHMR(instance)
    }

    const { bum, scope, update, subTree, um } = instance

    // beforeUnmount hook
    if (bum) {
      invokeArrayFns(bum)
    }

    if (
      __COMPAT__ &&
      isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
    ) {
      instance.emit('hook:beforeDestroy')
    }

    // stop effects in component scope
    scope.stop()

    // update may be null if a component is unmounted before its async
    // setup has resolved.
    if (update) {
      // so that scheduler will no longer invoke it
      update.active = false
      unmount(subTree, instance, parentSuspense, doRemove)
    }
    // unmounted hook
    if (um) {
      queuePostRenderEffect(um, parentSuspense)
    }
    if (
      __COMPAT__ &&
      isCompatEnabled(DeprecationTypes.INSTANCE_EVENT_HOOKS, instance)
    ) {
      queuePostRenderEffect(
        () => instance.emit('hook:destroyed'),
        parentSuspense,
      )
    }
    queuePostRenderEffect(() => {
      instance.isUnmounted = true
    }, parentSuspense)

    // A component with async dep inside a pending suspense is unmounted before
    // its async dep resolves. This should remove the dep from the suspense, and
    // cause the suspense to resolve immediately if that was the last dep.
    if (
      __FEATURE_SUSPENSE__ &&
      parentSuspense &&
      parentSuspense.pendingBranch &&
      !parentSuspense.isUnmounted &&
      instance.asyncDep &&
      !instance.asyncResolved &&
      instance.suspenseId === parentSuspense.pendingId
    ) {
      parentSuspense.deps--
      if (parentSuspense.deps === 0) {
        parentSuspense.resolve()
      }
    }

    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      devtoolsComponentRemoved(instance)
    }
  }

  const unmountChildren: UnmountChildrenFn = (
    children,
    parentComponent,
    parentSuspense,
    doRemove = false,
    optimized = false,
    start = 0,
  ) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove, optimized)
    }
  }

  const getNextHostNode: NextFn = vnode => {
    if (vnode.shapeFlag & ShapeFlags.COMPONENT) {
      return getNextHostNode(vnode.component!.subTree)
    }
    if (__FEATURE_SUSPENSE__ && vnode.shapeFlag & ShapeFlags.SUSPENSE) {
      return vnode.suspense!.next()
    }
    return hostNextSibling((vnode.anchor || vnode.el)!)
  }

  let isFlushing = false
  /**
   * render 函数是Vue.js框架中用于渲染和更新DOM的核心函数。
   * 这个函数的作用是对传入的虚拟节点（VNode）进行处理，并根据情况创建或更新实际的DOM元素。
   * @param vnode 一个虚拟DOM节点(就是我们开发时调用createApp(<App>))传入的App组件
   * @param container 真实的DOM对象(调用mount()时传入的DOM对象)
   * @param namespace 命名空间
   */
  const render: RootRenderFunction = (vnode, container, namespace) => {
    // 当传入的 vnode 为 null 时，表示需要卸载已有的组件或DOM节点
    if (vnode == null) {
      // 如果 container._vnode存在，则调用 unmount 函数移除该DOM节点及其相关的组件实例
      if (container._vnode) {
        unmount(container._vnode, null, null, true)
      }
    } else {
      // 如果 vnode 不为空，则执行 patch 函数：
      // 这个函数会对比旧的虚拟DOM树（container._vnode）与新的虚拟DOM树（vnode），
      // 找出最小化的DOM操作集并应用到实际DOM上，完成视图的更新。
      // 参数 为旧虚拟节点(container._vnode) 新虚拟节点(vnode )和DOM容器(container)等
      patch(
        container._vnode || null,
        vnode,
        container,
        null,
        null,
        null,
        namespace,
      )
    }
    // 判断表示当前是否正在执行回调。
    // 这个条件确保 flushPreFlushCbs 和 flushPostFlushCbs 在一次渲染循环中只执行一次
    if (!isFlushing) {
      isFlushing = true

      flushPreFlushCbs() //执行pre队列的job
      flushPostFlushCbs() //执行post队列的job
      isFlushing = false
    }
    // 将新的虚拟节点存储在容器的 _vnode 属性中，以便下次渲染时使用
    container._vnode = vnode
  }

  const internals: RendererInternals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options,
  }

  let hydrate: ReturnType<typeof createHydrationFunctions>[0] | undefined
  let hydrateNode: ReturnType<typeof createHydrationFunctions>[1] | undefined
  if (createHydrationFns) {
    ;[hydrate, hydrateNode] = createHydrationFns(
      internals as RendererInternals<Node, Element>,
    )
  }

  return {
    render,
    hydrate,
    createApp: createAppAPI(render, hydrate),
  }
}
/**
 * resolveChildrenNamespace 函数的作用是确定子元素的命名空间。
 * 在虚拟 DOM 的渲染过程中，某些特定的元素类型可能需要在不同的命名空间下创建其子元素。
 * 这通常发生在 SVG 或 MathML 这类特殊的元素中，它们有自己的命名空间，并且它们的子元素可能不属于相同的命名空间。
 * @param type 元素的类型
 * @param props 元素的属性
 * @param currentNamespace  当前元素的命名空间
 * @returns 
 */
function resolveChildrenNamespace(
  { type, props }: VNode,
  currentNamespace: ElementNamespace,
): ElementNamespace {
  // 如果当前命名空间是 'svg' 并且元素类型是 'foreignObject'，或者当前命名空间是 'mathml' 并且元素类型是 'annotation-xml' 并且它的属性中包含 encoding 属性且该属性包含 'html' 字符串，那么子元素的命名空间应该是不定义的（undefined）。
  // 这意味着子元素应该使用 HTML 的标准命名空间，而不是父元素的特殊命名空间。
  return (currentNamespace === 'svg' && type === 'foreignObject') ||
    (currentNamespace === 'mathml' &&
      type === 'annotation-xml' &&
      props &&
      props.encoding &&
      props.encoding.includes('html'))
    ? undefined
    // 在其他所有情况下，子元素应该使用与父元素相同的命名空间，所以函数返回 currentNamespace。
    : currentNamespace
}

function toggleRecurse(
  { effect, update }: ComponentInternalInstance,
  allowed: boolean,
) {
  effect.allowRecurse = update.allowRecurse = allowed
}

export function needTransition(
  parentSuspense: SuspenseBoundary | null,
  transition: TransitionHooks | null,
) {
  return (
    (!parentSuspense || (parentSuspense && !parentSuspense.pendingBranch)) &&
    transition &&
    !transition.persisted
  )
}

/**
 * #1156
 * When a component is HMR-enabled, we need to make sure that all static nodes
 * inside a block also inherit the DOM element from the previous tree so that
 * HMR updates (which are full updates) can retrieve the element for patching.
 *
 * #2080
 * Inside keyed `template` fragment static children, if a fragment is moved,
 * the children will always be moved. Therefore, in order to ensure correct move
 * position, el should be inherited from previous nodes.
 */
export function traverseStaticChildren(n1: VNode, n2: VNode, shallow = false) {
  const ch1 = n1.children
  const ch2 = n2.children
  if (isArray(ch1) && isArray(ch2)) {
    for (let i = 0; i < ch1.length; i++) {
      // this is only called in the optimized path so array children are
      // guaranteed to be vnodes
      const c1 = ch1[i] as VNode
      let c2 = ch2[i] as VNode
      if (c2.shapeFlag & ShapeFlags.ELEMENT && !c2.dynamicChildren) {
        if (c2.patchFlag <= 0 || c2.patchFlag === PatchFlags.NEED_HYDRATION) {
          c2 = ch2[i] = cloneIfMounted(ch2[i] as VNode)
          c2.el = c1.el
        }
        if (!shallow) traverseStaticChildren(c1, c2)
      }
      // #6852 also inherit for text nodes
      if (c2.type === Text) {
        c2.el = c1.el
      }
      // also inherit for comment nodes, but not placeholders (e.g. v-if which
      // would have received .el during block patch)
      if (__DEV__ && c2.type === Comment && !c2.el) {
        c2.el = c1.el
      }
    }
  }
}

// https://en.wikipedia.org/wiki/Longest_increasing_subsequence
function getSequence(arr: number[]): number[] {
  const p = arr.slice()
  const result = [0]
  let i, j, u, v, c
  const len = arr.length
  for (i = 0; i < len; i++) {
    const arrI = arr[i]
    if (arrI !== 0) {
      j = result[result.length - 1]
      if (arr[j] < arrI) {
        p[i] = j
        result.push(i)
        continue
      }
      u = 0
      v = result.length - 1
      while (u < v) {
        c = (u + v) >> 1
        if (arr[result[c]] < arrI) {
          u = c + 1
        } else {
          v = c
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1]
        }
        result[u] = i
      }
    }
  }
  u = result.length
  v = result[u - 1]
  while (u-- > 0) {
    result[u] = v
    v = p[v]
  }
  return result
}

function locateNonHydratedAsyncRoot(
  instance: ComponentInternalInstance,
): ComponentInternalInstance | undefined {
  const subComponent = instance.subTree.component
  if (subComponent) {
    if (subComponent.asyncDep && !subComponent.asyncResolved) {
      return subComponent
    } else {
      return locateNonHydratedAsyncRoot(subComponent)
    }
  }
}
