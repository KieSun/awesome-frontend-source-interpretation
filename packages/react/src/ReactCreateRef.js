/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @flow
 */

import type {RefObject} from 'shared/ReactTypes';

// an immutable object with a single mutable value
// 这个代码是不是贼简单，就是让你外部能够通过 current 去拿到 ref
// 但是可能很多人没见过 Object.seal 这个 API
// 直接给不清楚的各位复制了文档：封闭一个对象，阻止添加新属性并将所有现有属性标记为不可配置
export function createRef(): RefObject {
  const refObject = {
    current: null,
  };
  if (__DEV__) {
    Object.seal(refObject);
  }
  return refObject;
}
