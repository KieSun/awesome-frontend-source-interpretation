/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactFiber';
import type {ExpirationTime} from './ReactFiberExpirationTime';
import type {TimeoutHandle, NoTimeout} from './ReactFiberHostConfig';
import type {Thenable} from './ReactFiberScheduler';
import type {Interaction} from 'scheduler/src/Tracing';

import {noTimeout} from './ReactFiberHostConfig';
import {createHostRootFiber} from './ReactFiber';
import {NoWork} from './ReactFiberExpirationTime';
import {
  enableSchedulerTracing,
  enableNewScheduler,
} from 'shared/ReactFeatureFlags';
import {unstable_getThreadID} from 'scheduler/tracing';

// TODO: This should be lifted into the renderer.
export type Batch = {
  _defer: boolean,
  _expirationTime: ExpirationTime,
  _onComplete: () => mixed,
  _next: Batch | null,
};

export type PendingInteractionMap = Map<ExpirationTime, Set<Interaction>>;

type BaseFiberRootProperties = {|
  // Any additional information from the host associated with this root.
  // 容器，也就是 render 的第二个参数
  containerInfo: any,
  // Used only by persistent updates.
  // 只在持续更新中使用
  pendingChildren: any,
  // The currently active root fiber. This is the mutable root of the tree.
  // 当前的 fiber 对象，也就是 root fiber
  current: Fiber,

  // The following priority levels are used to distinguish between 1)
  // uncommitted work, 2) uncommitted work that is suspended, and 3) uncommitted
  // work that may be unsuspended. We choose not to track each individual
  // pending level, trading granularity for performance.
  // 以下几种优先级是用来区分几种情况的
  // 1 未提交的 work
  // 2 未提交的 work 是暂停的
  // 3 未提交的 work 可能是没暂停的
  // The earliest and latest priority levels that are suspended from committing.
  earliestSuspendedTime: ExpirationTime,
  latestSuspendedTime: ExpirationTime,
  // The earliest and latest priority levels that are not known to be suspended.
  earliestPendingTime: ExpirationTime,
  latestPendingTime: ExpirationTime,
  // The latest priority level that was pinged by a resolved promise and can
  // be retried.
  latestPingedTime: ExpirationTime,

  pingCache:
    | WeakMap<Thenable, Set<ExpirationTime>>
    | Map<Thenable, Set<ExpirationTime>>
    | null,

  // If an error is thrown, and there are no more updates in the queue, we try
  // rendering from the root one more time, synchronously, before handling
  // the error.
  didError: boolean,

  pendingCommitExpirationTime: ExpirationTime,
  // A finished work-in-progress HostRoot that's ready to be committed.
  finishedWork: Fiber | null,
  // Timeout handle returned by setTimeout. Used to cancel a pending timeout, if
  // it's superseded by a new one.
  timeoutHandle: TimeoutHandle | NoTimeout,
  // Top context object, used by renderSubtreeIntoContainer
  context: Object | null,
  pendingContext: Object | null,
  // Determines if we should attempt to hydrate on the initial mount
  // 这个属性说过好几次了
  +hydrate: boolean,
  // Remaining expiration time on this root.
  // TODO: Lift this into the renderer
  // root 的剩余停止时间
  nextExpirationTimeToWorkOn: ExpirationTime,
  // 过期时间
  expirationTime: ExpirationTime,
  // List of top-level batches. This list indicates whether a commit should be
  // deferred. Also contains completion callbacks.
  // TODO: Lift this into the renderer
  firstBatch: Batch | null,
  // Linked-list of roots
  // root 的链表
  nextScheduledRoot: FiberRoot | null,

  // New Scheduler fields
  // 几个新的字段
  callbackNode: *,
  callbackExpirationTime: ExpirationTime,
  firstPendingTime: ExpirationTime,
  lastPendingTime: ExpirationTime,
  pingTime: ExpirationTime,
|};

// The following attributes are only used by interaction tracing builds.
// They enable interactions to be associated with their async work,
// And expose interaction metadata to the React DevTools Profiler plugin.
// Note that these attributes are only defined when the enableSchedulerTracing flag is enabled.
type ProfilingOnlyFiberRootProperties = {|
  interactionThreadID: number,
  memoizedInteractions: Set<Interaction>,
  pendingInteractionMap: PendingInteractionMap,
|};

// Exported FiberRoot type includes all properties,
// To avoid requiring potentially error-prone :any casts throughout the project.
// Profiling properties are only safe to access in profiling builds (when enableSchedulerTracing is true).
// The types are defined separately within this file to ensure they stay in sync.
// (We don't have to use an inline :any cast when enableSchedulerTracing is disabled.)
export type FiberRoot = {
  ...BaseFiberRootProperties,
  ...ProfilingOnlyFiberRootProperties,
};
function FiberRootNode(containerInfo, hydrate) {
  // 以下每个属性的意义可以查看 BaseFiberRootProperties
  // 在那里我把一些属性都注释了一遍中文
  this.current = null;
  this.containerInfo = containerInfo;
  this.pendingChildren = null;
  this.pingCache = null;
  this.pendingCommitExpirationTime = NoWork;
  this.finishedWork = null;
  this.timeoutHandle = noTimeout;
  this.context = null;
  this.pendingContext = null;
  this.hydrate = hydrate;
  this.firstBatch = null;

  if (enableNewScheduler) {
    this.callbackNode = null;
    this.callbackExpirationTime = NoWork;
    this.firstPendingTime = NoWork;
    this.lastPendingTime = NoWork;
    this.pingTime = NoWork;
  } else {
    this.earliestPendingTime = NoWork;
    this.latestPendingTime = NoWork;
    this.earliestSuspendedTime = NoWork;
    this.latestSuspendedTime = NoWork;
    this.latestPingedTime = NoWork;
    this.didError = false;
    this.nextExpirationTimeToWorkOn = NoWork;
    this.expirationTime = NoWork;
    this.nextScheduledRoot = null;
  }

  if (enableSchedulerTracing) {
    this.interactionThreadID = unstable_getThreadID();
    this.memoizedInteractions = new Set();
    this.pendingInteractionMap = new Map();
  }
}

export function createFiberRoot(
  containerInfo: any,
  isConcurrent: boolean,
  hydrate: boolean,
): FiberRoot {
  // FiberRootNode 内部创建了很多属性
  const root: FiberRoot = (new FiberRootNode(containerInfo, hydrate): any);

  // Cyclic construction. This cheats the type system right now because
  // stateNode is any.
  // 创建一个 root fiber，这也是 React 16 中的核心架构了
  // fiber 其实也会组成一个树结构，内部使用了单链表树结构，每个节点及组件都会对应一个 fiber
  // FiberRoot 和 Root Fiber 会互相引用
  // 这两个对象的内部属性可以自行查阅，反正有详细的注释表面重要的属性的含义
  // 另外如果你有 React 写的项目的话，可以通过以下代码找到 Fiber Root，它对应着容器
  // document.querySelector('#root')._reactRootContainer._internalRoot
  // 另外 fiber tree 的结构可以看我画的这个图
  // https://user-gold-cdn.xitu.io/2019/5/2/16a7672bc5152431?w=1372&h=2024&f=png&s=316240
  const uninitializedFiber = createHostRootFiber(isConcurrent);
  root.current = uninitializedFiber;
  uninitializedFiber.stateNode = root;

  return root;
}
