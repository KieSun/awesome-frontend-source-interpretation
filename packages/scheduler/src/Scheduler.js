/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* eslint-disable no-var */

import {enableSchedulerDebugging} from './SchedulerFeatureFlags';
import {
  requestHostCallback,
  cancelHostCallback,
  shouldYieldToHost,
  getCurrentTime,
} from './SchedulerHostConfig';

// TODO: Use symbols?
var ImmediatePriority = 1;
var UserBlockingPriority = 2;
var NormalPriority = 3;
var LowPriority = 4;
var IdlePriority = 5;

// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823;

// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// Never times out
var IDLE_PRIORITY = maxSigned31BitInt;

// Callbacks are stored as a circular, doubly linked list.
var firstCallbackNode = null;

var currentHostCallbackDidTimeout = false;
// Pausing the scheduler is useful for debugging.
var isSchedulerPaused = false;

var currentPriorityLevel = NormalPriority;
var currentEventStartTime = -1;
var currentExpirationTime = -1;

// This is set while performing work, to prevent re-entrancy.
var isPerformingWork = false;

var isHostCallbackScheduled = false;

function scheduleHostCallbackIfNeeded() {
  // 如果已经调用 flushWork 的话
  if (isPerformingWork) {
    // Don't schedule work yet; wait until the next time we yield.
    return;
  }
  if (firstCallbackNode !== null) {
    // Schedule the host callback using the earliest expiration in the list.
    var expirationTime = firstCallbackNode.expirationTime;
    if (isHostCallbackScheduled) {
      // Cancel the existing host callback.
      cancelHostCallback();
    } else {
      isHostCallbackScheduled = true;
    }
    requestHostCallback(flushWork, expirationTime);
  }
}

function flushFirstCallback() {
  const currentlyFlushingCallback = firstCallbackNode;

  // Remove the node from the list before calling the callback. That way the
  // list is in a consistent state even if the callback throws.
  // 链表操作
  var next = firstCallbackNode.next;
  if (firstCallbackNode === next) {
    // This is the last callback in the list.
    // 当前链表中只有一个节点
    firstCallbackNode = null;
    next = null;
  } else {
    // 有多个节点，重新赋值 firstCallbackNode，用于之前函数中下一次的 while 判断
    var lastCallbackNode = firstCallbackNode.previous;
    firstCallbackNode = lastCallbackNode.next = next;
    next.previous = lastCallbackNode;
  }
  // 清空指针
  currentlyFlushingCallback.next = currentlyFlushingCallback.previous = null;

  // Now it's safe to call the callback.
  // 这个 callback 是 performAsyncWork 函数
  var callback = currentlyFlushingCallback.callback;
  var expirationTime = currentlyFlushingCallback.expirationTime;
  var priorityLevel = currentlyFlushingCallback.priorityLevel;
  var previousPriorityLevel = currentPriorityLevel;
  var previousExpirationTime = currentExpirationTime;
  currentPriorityLevel = priorityLevel;
  currentExpirationTime = expirationTime;
  var continuationCallback;
  try {
    const didUserCallbackTimeout =
      currentHostCallbackDidTimeout ||
      // Immediate priority callbacks are always called as if they timed out
      priorityLevel === ImmediatePriority;
    continuationCallback = callback(didUserCallbackTimeout);
  } catch (error) {
    throw error;
  } finally {
    currentPriorityLevel = previousPriorityLevel;
    currentExpirationTime = previousExpirationTime;
  }

  // A callback may return a continuation. The continuation should be scheduled
  // with the same priority and expiration as the just-finished callback.
  // performAsyncWork 并不会返回任何值，所以这个条件也进不去
  // 但是代码我们还是看看的，核心其实和之前设置链表节点一样
  // 生成一个新节点，判断两个节点的优先级
  if (typeof continuationCallback === 'function') {
    var continuationNode: CallbackNode = {
      callback: continuationCallback,
      priorityLevel,
      expirationTime,
      next: null,
      previous: null,
    };

    // Insert the new callback into the list, sorted by its expiration. This is
    // almost the same as the code in `scheduleCallback`, except the callback
    // is inserted into the list *before* callbacks of equal expiration instead
    // of after.
    if (firstCallbackNode === null) {
      // This is the first callback in the list.
      firstCallbackNode = continuationNode.next = continuationNode.previous = continuationNode;
    } else {
      var nextAfterContinuation = null;
      var node = firstCallbackNode;
      do {
        if (node.expirationTime >= expirationTime) {
          // This callback expires at or after the continuation. We will insert
          // the continuation *before* this callback.
          nextAfterContinuation = node;
          break;
        }
        node = node.next;
      } while (node !== firstCallbackNode);

      if (nextAfterContinuation === null) {
        // No equal or lower priority callback was found, which means the new
        // callback is the lowest priority callback in the list.
        nextAfterContinuation = firstCallbackNode;
      } else if (nextAfterContinuation === firstCallbackNode) {
        // The new callback is the highest priority callback in the list.
        firstCallbackNode = continuationNode;
        scheduleHostCallbackIfNeeded();
      }

      var previous = nextAfterContinuation.previous;
      previous.next = nextAfterContinuation.previous = continuationNode;
      continuationNode.next = nextAfterContinuation;
      continuationNode.previous = previous;
    }
  }
}

function flushWork(didUserCallbackTimeout) {
  // Exit right away if we're currently paused
  if (enableSchedulerDebugging && isSchedulerPaused) {
    return;
  }

  // We'll need a new host callback the next time work is scheduled.
  // 一些变量的设置
  isHostCallbackScheduled = false;

  isPerformingWork = true;
  const previousDidTimeout = currentHostCallbackDidTimeout;
  currentHostCallbackDidTimeout = didUserCallbackTimeout;
  try {
    // 判断是否超时
    if (didUserCallbackTimeout) {
      // Flush all the expired callbacks without yielding.
      while (
        firstCallbackNode !== null &&
        !(enableSchedulerDebugging && isSchedulerPaused)
      ) {
        // TODO Wrap in feature flag
        // Read the current time. Flush all the callbacks that expire at or
        // earlier than that time. Then read the current time again and repeat.
        // This optimizes for as few performance.now calls as possible.
        // 超时的话，获取当前时间，判断任务是否过期，过期的话就执行任务
        // 并且判断下一个任务是否也已经过期
        var currentTime = getCurrentTime();
        if (firstCallbackNode.expirationTime <= currentTime) {
          do {
            flushFirstCallback();
          } while (
            firstCallbackNode !== null &&
            firstCallbackNode.expirationTime <= currentTime &&
            !(enableSchedulerDebugging && isSchedulerPaused)
          );
          continue;
        }
        break;
      }
    } else {
      // Keep flushing callbacks until we run out of time in the frame.
      // 没有超时说明还有时间可以执行任务，执行任务完成后继续判断
      if (firstCallbackNode !== null) {
        do {
          if (enableSchedulerDebugging && isSchedulerPaused) {
            break;
          }
          flushFirstCallback();
        // !shouldYieldToHost 就是判断 frameDeadline > getCurrentTime()，也就是判断当前帧是否还有时间
        } while (firstCallbackNode !== null && !shouldYieldToHost());
      }
    }
  } finally {
    isPerformingWork = false;
    currentHostCallbackDidTimeout = previousDidTimeout;
    // There's still work remaining. Request another callback.
    scheduleHostCallbackIfNeeded();
  }
}

function unstable_runWithPriority(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
    case LowPriority:
    case IdlePriority:
      break;
    default:
      priorityLevel = NormalPriority;
  }

  var previousPriorityLevel = currentPriorityLevel;
  var previousEventStartTime = currentEventStartTime;
  currentPriorityLevel = priorityLevel;
  currentEventStartTime = getCurrentTime();

  try {
    return eventHandler();
  } catch (error) {
    // There's still work remaining. Request another callback.
    scheduleHostCallbackIfNeeded();
    throw error;
  } finally {
    currentPriorityLevel = previousPriorityLevel;
    currentEventStartTime = previousEventStartTime;
  }
}

function unstable_next(eventHandler) {
  let priorityLevel;
  switch (currentPriorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
      // Shift down to normal priority
      priorityLevel = NormalPriority;
      break;
    default:
      // Anything lower than normal priority should remain at the current level.
      priorityLevel = currentPriorityLevel;
      break;
  }

  var previousPriorityLevel = currentPriorityLevel;
  var previousEventStartTime = currentEventStartTime;
  currentPriorityLevel = priorityLevel;
  currentEventStartTime = getCurrentTime();

  try {
    return eventHandler();
  } catch (error) {
    // There's still work remaining. Request another callback.
    scheduleHostCallbackIfNeeded();
    throw error;
  } finally {
    currentPriorityLevel = previousPriorityLevel;
    currentEventStartTime = previousEventStartTime;
  }
}

function unstable_wrapCallback(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    // This is a fork of runWithPriority, inlined for performance.
    var previousPriorityLevel = currentPriorityLevel;
    var previousEventStartTime = currentEventStartTime;
    currentPriorityLevel = parentPriorityLevel;
    currentEventStartTime = getCurrentTime();

    try {
      return callback.apply(this, arguments);
    } catch (error) {
      // There's still work remaining. Request another callback.
      scheduleHostCallbackIfNeeded();
      throw error;
    } finally {
      currentPriorityLevel = previousPriorityLevel;
      currentEventStartTime = previousEventStartTime;
    }
  };
}

function unstable_scheduleCallback(
  priorityLevel,
  callback,
  deprecated_options,
) {
  var startTime =
    currentEventStartTime !== -1 ? currentEventStartTime : getCurrentTime();
  // 这里其实只会进第一个 if 条件，因为外部写死了一定会传 deprecated_options.timeout
  // 接下来的 expirationTime 和之前的逻辑就反过来了
  // 变成越小优先级越高了，同时也代表一个任务的过期时间
  var expirationTime;
  if (
    typeof deprecated_options === 'object' &&
    deprecated_options !== null &&
    typeof deprecated_options.timeout === 'number'
  ) {
    // FIXME: Remove this branch once we lift expiration times out of React.
    expirationTime = startTime + deprecated_options.timeout;
  } else {
    // 其实我觉得这部分代码好理解多了，通过优先级来定过期时间，不用去算那个 timeout
    // 说实话计算那个时间真的看得我头疼。。
    switch (priorityLevel) {
      case ImmediatePriority:
        expirationTime = startTime + IMMEDIATE_PRIORITY_TIMEOUT;
        break;
      case UserBlockingPriority:
        expirationTime = startTime + USER_BLOCKING_PRIORITY;
        break;
      case IdlePriority:
        expirationTime = startTime + IDLE_PRIORITY;
        break;
      case LowPriority:
        expirationTime = startTime + LOW_PRIORITY_TIMEOUT;
        break;
      case NormalPriority:
      default:
        expirationTime = startTime + NORMAL_PRIORITY_TIMEOUT;
    }
  }
  // 环形双向链表结构，下面就是考验大家数据结构功底的时候了
  var newNode = {
    callback,
    priorityLevel: priorityLevel,
    expirationTime,
    next: null,
    previous: null,
  };

  // Insert the new callback into the list, ordered first by expiration, then
  // by insertion. So the new callback is inserted any other callback with
  // equal expiration.
  // 看不懂代码的话，就自己谷歌一下环形双向链表是怎么实现的，这里我就不解析实现了了
  // 核心思路就是 firstCallbackNode 优先级最高 lastCallbackNode 优先级最低
  // 新生成一个 newNode 以后，就从头开始比较优先级
  // 如果新的高，就把新的往前插入，否则就往后插，直到没有一个 node 的优先级比他低
  // 那么新的节点就变成 lastCallbackNode
  // 除了改变 lastCallbackNode 的情况，其他情况都需要重新调度，因为调度必须从 firstCallbackNode 开始
  if (firstCallbackNode === null) {
    // This is the first callback in the list.
    firstCallbackNode = newNode.next = newNode.previous = newNode;
    scheduleHostCallbackIfNeeded();
  } else {
    var next = null;
    var node = firstCallbackNode;
    do {
      if (node.expirationTime > expirationTime) {
        // The new callback expires before this one.
        next = node;
        break;
      }
      node = node.next;
    } while (node !== firstCallbackNode);

    if (next === null) {
      // No callback with a later expiration was found, which means the new
      // callback has the latest expiration in the list.
      next = firstCallbackNode;
    } else if (next === firstCallbackNode) {
      // The new callback has the earliest expiration in the entire list.
      firstCallbackNode = newNode;
      scheduleHostCallbackIfNeeded();
    }

    var previous = next.previous;
    previous.next = next.previous = newNode;
    newNode.next = next;
    newNode.previous = previous;
  }

  return newNode;
}

function unstable_pauseExecution() {
  isSchedulerPaused = true;
}

function unstable_continueExecution() {
  isSchedulerPaused = false;
  if (firstCallbackNode !== null) {
    scheduleHostCallbackIfNeeded();
  }
}

function unstable_getFirstCallbackNode() {
  return firstCallbackNode;
}

function unstable_cancelCallback(callbackNode) {
  var next = callbackNode.next;
  if (next === null) {
    // Already cancelled.
    return;
  }

  if (next === callbackNode) {
    // This is the only scheduled callback. Clear the list.
    firstCallbackNode = null;
  } else {
    // Remove the callback from its position in the list.
    if (callbackNode === firstCallbackNode) {
      firstCallbackNode = next;
    }
    var previous = callbackNode.previous;
    previous.next = next;
    next.previous = previous;
  }

  callbackNode.next = callbackNode.previous = null;
}

function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}

function unstable_shouldYield() {
  return (
    !currentHostCallbackDidTimeout &&
    ((firstCallbackNode !== null &&
      firstCallbackNode.expirationTime < currentExpirationTime) ||
      shouldYieldToHost())
  );
}

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  LowPriority as unstable_LowPriority,
  unstable_runWithPriority,
  unstable_next,
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_wrapCallback,
  unstable_getCurrentPriorityLevel,
  unstable_shouldYield,
  unstable_continueExecution,
  unstable_pauseExecution,
  unstable_getFirstCallbackNode,
  getCurrentTime as unstable_now,
};
