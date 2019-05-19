/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// The DOM Scheduler implementation is similar to requestIdleCallback. It
// works by scheduling a requestAnimationFrame, storing the time for the start
// of the frame, then scheduling a postMessage which gets scheduled after paint.
// Within the postMessage handler do as much work as possible until time + frame
// rate. By separating the idle call into a separate event tick we ensure that
// layout, paint and other browser work is counted against the available time.
// The frame rate is dynamically adjusted.

export let requestHostCallback;
export let cancelHostCallback;
export let shouldYieldToHost;
export let getCurrentTime;

const hasNativePerformanceNow =
  typeof performance === 'object' && typeof performance.now === 'function';

// We capture a local reference to any global, in case it gets polyfilled after
// this module is initially evaluated. We want to be using a
// consistent implementation.
const localDate = Date;

// This initialization code may run even on server environments if a component
// just imports ReactDOM (e.g. for findDOMNode). Some environments might not
// have setTimeout or clearTimeout. However, we always expect them to be defined
// on the client. https://github.com/facebook/react/pull/13088
const localSetTimeout =
  typeof setTimeout === 'function' ? setTimeout : undefined;
const localClearTimeout =
  typeof clearTimeout === 'function' ? clearTimeout : undefined;

// We don't expect either of these to necessarily be defined, but we will error
// later if they are missing on the client.
const localRequestAnimationFrame =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : undefined;
const localCancelAnimationFrame =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : undefined;

// requestAnimationFrame does not run when the tab is in the background. If
// we're backgrounded we prefer for that work to happen so that the page
// continues to load in the background. So we also schedule a 'setTimeout' as
// a fallback.
// TODO: Need a better heuristic for backgrounded work.
const ANIMATION_FRAME_TIMEOUT = 100;
let rAFID;
let rAFTimeoutID;
const requestAnimationFrameWithTimeout = function(callback) {
  // schedule rAF and also a setTimeout
  // 这里的 local 开头的函数指的是 request​Animation​Frame 及 setTimeout
  // request​Animation​Frame 只有页面在前台时才会执行回调
  // 如果页面在后台时就不会执行回调，这时候会通过 setTimeout 来保证执行 callback
  // 两个回调中都可以互相 cancel 定时器
  // callback 指的是 animationTick
  rAFID = localRequestAnimationFrame(function(timestamp) {
    // cancel the setTimeout
    localClearTimeout(rAFTimeoutID);
    callback(timestamp);
  });
  rAFTimeoutID = localSetTimeout(function() {
    // cancel the requestAnimationFrame
    localCancelAnimationFrame(rAFID);
    callback(getCurrentTime());
  }, ANIMATION_FRAME_TIMEOUT);
};

if (hasNativePerformanceNow) {
  const Performance = performance;
  getCurrentTime = function() {
    return Performance.now();
  };
} else {
  getCurrentTime = function() {
    return localDate.now();
  };
}

if (
  // If Scheduler runs in a non-DOM environment, it falls back to a naive
  // implementation using setTimeout.
  typeof window === 'undefined' ||
  // Check if MessageChannel is supported, too.
  typeof MessageChannel !== 'function'
) {
  // If this accidentally gets imported in a non-browser environment, e.g. JavaScriptCore,
  // fallback to a naive implementation.
  let _callback = null;
  const _flushCallback = function(didTimeout) {
    if (_callback !== null) {
      try {
        _callback(didTimeout);
      } finally {
        _callback = null;
      }
    }
  };
  requestHostCallback = function(cb, ms) {
    if (_callback !== null) {
      // Protect against re-entrancy.
      setTimeout(requestHostCallback, 0, cb);
    } else {
      _callback = cb;
      setTimeout(_flushCallback, 0, false);
    }
  };
  cancelHostCallback = function() {
    _callback = null;
  };
  shouldYieldToHost = function() {
    return false;
  };
} else {
  if (typeof console !== 'undefined') {
    // TODO: Remove fb.me link
    if (typeof localRequestAnimationFrame !== 'function') {
      console.error(
        "This browser doesn't support requestAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://fb.me/react-polyfills',
      );
    }
    if (typeof localCancelAnimationFrame !== 'function') {
      console.error(
        "This browser doesn't support cancelAnimationFrame. " +
          'Make sure that you load a ' +
          'polyfill in older browsers. https://fb.me/react-polyfills',
      );
    }
  }

  let scheduledHostCallback = null;
  let isMessageEventScheduled = false;
  let timeoutTime = -1;

  let isAnimationFrameScheduled = false;

  let isFlushingHostCallback = false;

  let frameDeadline = 0;
  // We start out assuming that we run at 30fps but then the heuristic tracking
  // will adjust this value to a faster fps if we get more frequent animation
  // frames.
  let previousFrameTime = 33;
  let activeFrameTime = 33;

  shouldYieldToHost = function() {
    return frameDeadline <= getCurrentTime();
  };

  // We use the postMessage trick to defer idle work until after the repaint.
  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = function(event) {
    // 一些变量的设置
    isMessageEventScheduled = false;

    const prevScheduledCallback = scheduledHostCallback;
    const prevTimeoutTime = timeoutTime;
    scheduledHostCallback = null;
    timeoutTime = -1;
    // 获取当前时间
    const currentTime = getCurrentTime();

    let didTimeout = false;
    // 判断之前计算的时间是否小于当前时间，时间超了也就代表在 onmessage 之前执行任务所需时间过长
    if (frameDeadline - currentTime <= 0) {
      // There's no time left in this idle period. Check if the callback has
      // a timeout and whether it's been exceeded.
      // 判断当前任务是否过期
      if (prevTimeoutTime !== -1 && prevTimeoutTime <= currentTime) {
        // Exceeded the timeout. Invoke the callback even though there's no
        // time left.
        didTimeout = true;
      } else {
        // No timeout.
        // 没过期的话再丢到下一帧去执行
        if (!isAnimationFrameScheduled) {
          // Schedule another animation callback so we retry later.
          isAnimationFrameScheduled = true;
          requestAnimationFrameWithTimeout(animationTick);
        }
        // Exit without invoking the callback.
        scheduledHostCallback = prevScheduledCallback;
        timeoutTime = prevTimeoutTime;
        return;
      }
    }
    // 最后执行 flushWork，onmessage 中涉及到的 callback 全是 flushWork
    if (prevScheduledCallback !== null) {
      isFlushingHostCallback = true;
      try {
        prevScheduledCallback(didTimeout);
      } finally {
        isFlushingHostCallback = false;
      }
    }
  };

  const animationTick = function(rafTime) {
    // scheduledHostCallback 指的是 flushWork，是 requestHostCallback 函数传进来的
    if (scheduledHostCallback !== null) {
      // Eagerly schedule the next animation callback at the beginning of the
      // frame. If the scheduler queue is not empty at the end of the frame, it
      // will continue flushing inside that callback. If the queue *is* empty,
      // then it will exit immediately. Posting the callback at the start of the
      // frame ensures it's fired within the earliest possible frame. If we
      // waited until the end of the frame to post the callback, we risk the
      // browser skipping a frame and not firing the callback until the frame
      // after that.
      // scheduledHostCallback 不为空的话就继续递归
      // 但是注意这里的递归并不是同步的，下一帧的时候才会再执行 animationTick
      requestAnimationFrameWithTimeout(animationTick);
    } else {
      // No pending work. Exit.
      isAnimationFrameScheduled = false;
      return;
    }
    // rafTime 就是 performance.now()，无论是执行哪个定时器
    // 假如我们应用第一次执行 animationTick，那么 frameDeadline = 0 activeFrameTime = 33
    // 也就是说此时 nextFrameTime = performance.now() + 33
    // 便于后期计算，我们假设 nextFrameTime = 5000 + 33 = 5033
    // 然后 activeFrameTime 为什么是 33 呢？因为 React 这里假设你的刷新率是 30hz
    // 一秒对应 1000 毫秒，1000 / 30 ≈ 33
    // ------------------------------- 以下注释是第二次的
    // 第二次进来这里执行，因为 animationTick 回调肯定是下一帧执行的，假如我们屏幕是 60hz 的刷新率
    // 那么一帧的时间为 1000 / 60 ≈ 16
    // 此时 nextFrameTime = 5000 + 16 - 5033 + 33 = 16
    // ------------------------------- 以下注释是第三次的
    // nextFrameTime = 5000 + 16 * 2 - 5048 + 33 = 17
    let nextFrameTime = rafTime - frameDeadline + activeFrameTime;
    // 这个 if 条件第一次肯定进不去
    // ------------------------------- 以下注释是第二次的
    // 此时 16 < 33 && 5033 < 33 = false，也就是说第二帧的时候这个 if 条件还是进不去
    // ------------------------------- 以下注释是第三次的
    // 此时 17 < 33 && 16 < 33 = true，进条件了，也就是说如果刷新率大于 30hz，那么得等两帧才会调整 activeFrameTime
    if (
      nextFrameTime < activeFrameTime &&
      previousFrameTime < activeFrameTime
    ) {
      // 这里小于 8 的判断，是因为不能处理大于 120 hz 刷新率以上的浏览器了
      if (nextFrameTime < 8) {
        // Defensive coding. We don't support higher frame rates than 120hz.
        // If the calculated frame time gets lower than 8, it is probably a bug.
        nextFrameTime = 8;
      }
      // If one frame goes long, then the next one can be short to catch up.
      // If two frames are short in a row, then that's an indication that we
      // actually have a higher frame rate than what we're currently optimizing.
      // We adjust our heuristic dynamically accordingly. For example, if we're
      // running on 120hz display or 90hz VR display.
      // Take the max of the two in case one of them was an anomaly due to
      // missed frame deadlines.
      // 第三帧进来以后，activeFrameTime = 16 < 17 ? 16 : 17 = 16
      // 然后下次就按照一帧 16 毫秒来算了
      activeFrameTime =
        nextFrameTime < previousFrameTime ? previousFrameTime : nextFrameTime;
    } else {
      // 第一次进来 5033
      // 第二次进来 16
      previousFrameTime = nextFrameTime;
    }
    //  第一次 frameDeadline = 5000 + 33 = 5033
    // ------------------------------- 以下注释是第二次的
    // frameDeadline = 5016 + 33 = 5048
    frameDeadline = rafTime + activeFrameTime;
    // 确保这一帧内不再 postMessage
    // postMessage 属于宏任务
    // const channel = new MessageChannel();
    // const port = channel.port2;
    // channel.port1.onmessage = function(event) {
    //   console.log(1)
    // }
    // requestAnimationFrame(function (timestamp) {
    //   setTimeout(function () {
    //     console.log('setTimeout')
    //   }, 0)
    //   port.postMessage(undefined)
    //   Promise.resolve(1).then(function (value) {
    //     console.log(value, 'Promise')
    //   })
    // })
    // 以上代码输出顺序为 Promise -> onmessage -> setTimeout
    // 由此可知微任务最先执行，然后是宏任务，并且在宏任务中也有顺序之分
    // onmessage 会优先于 setTimeout 回调执行
    // 对于浏览器来说，当我们执行 request​Animation​Frame 回调后
    // 会先让页面渲染，然后判断是否要执行微任务，最后执行宏任务，并且会先执行 onmessage
    // 当然其实比 onmessage 更快的宏任务是 set​Immediate，但是这个 API 只能在 IE 下使用
    if (!isMessageEventScheduled) {
      isMessageEventScheduled = true;
      port.postMessage(undefined);
    }
  };

  requestHostCallback = function(callback, absoluteTimeout) {
    scheduledHostCallback = callback;
    timeoutTime = absoluteTimeout;
    // isFlushingHostCallback 只在 channel.port1.onmessage 被设为 true
    // 也就是说当正在执行任务或者新进来的任务已经过了过期时间
    // 马上执行新的任务，不再等到下一帧
    if (isFlushingHostCallback || absoluteTimeout < 0) {
      // Don't wait for the next frame. Continue working ASAP, in a new event.
      // 发送消息，channel.port1.onmessage 会监听到消息并执行
      port.postMessage(undefined);
    } else if (!isAnimationFrameScheduled) {
      // If rAF didn't already schedule one, we need to schedule a frame.
      // TODO: If this rAF doesn't materialize because the browser throttles, we
      // might want to still have setTimeout trigger rIC as a backup to ensure
      // that we keep performing work.
      // isAnimationFrameScheduled 设为 true 的话就不会再进这个分支了
      // 但是内部会有机制确保 callback 执行
      isAnimationFrameScheduled = true;
      requestAnimationFrameWithTimeout(animationTick);
    }
  };

  cancelHostCallback = function() {
    scheduledHostCallback = null;
    isMessageEventScheduled = false;
    timeoutTime = -1;
  };
}
