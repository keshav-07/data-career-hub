---
title: "Subarray Product Less Than K: Count Windows Ending at Each Index"
seoTitle: "Subarray Product Less Than K: Variable Window"
description: "Count contiguous subarrays of positive integers whose product is below k. A shrinking window adds right − left + 1 subarrays per step for O(n) time."
technology: ["dsa"]
topic: ["two-pointers", "sliding-window"]
difficulty: "Medium"
questionType: ["coding"]
estimatedMinutes: 15
interviewRelevance: "High"
publishedDate: "2026-10-09"
updatedDate: "2026-10-09"
reviewedDate: "2026-10-09"
shortAnswer: "All values are positive, so extending a subarray can only grow its product and shrinking it can only reduce it. Move a right pointer across the array, multiply the product by the new value, then divide out values from the left while the product is at least k. Now every subarray that ends at right and starts anywhere from left to right qualifies, so add right − left + 1. Each pointer moves at most n times, giving O(n) time and O(1) space. Handle k ≤ 1 up front: no product of positive integers is below 1, and the shrink loop would otherwise run past the right pointer."
followUps: ["Why does the method break if the array can contain zeros or negative numbers?", "How would you avoid huge intermediate products, for example by using logarithms?", "How would you count subarrays whose sum is below k instead?"]
versionContext: "Python 3 solutions verified with assert-based tests"
related: ["articles:dsa/two-pointers", "articles:dsa/sliding-window"]
practice: {"platform": "LeetCode", "number": 713, "title": "Subarray Product Less Than K", "url": "https://leetcode.com/problems/subarray-product-less-than-k/"}
---

## Problem

You are given a list of positive integers `nums` and an integer `k`. Count the contiguous, non-empty subarrays whose product of elements is strictly less than `k`. This is LeetCode 713, Subarray Product Less Than K.

## Examples

```text
nums = [4, 2, 6, 1],  k = 20   ->  8
       [4] [2] [6] [1] [4,2] [2,6] [6,1] [2,6,1]   ([4,2,6] = 48 fails)
nums = [3, 3, 3],     k = 9    ->  3    (only the single elements)
nums = [5, 1, 1],     k = 1    ->  0    (k = 1: no product of positives is below 1)
```

## Approach 1: brute force

Fix each start and extend to the right, stopping as soon as the product reaches `k` (it can only grow from there).

```python
def count_product_brute(nums, k):
    count = 0
    for start in range(len(nums)):
        product = 1
        for end in range(start, len(nums)):
            product *= nums[end]
            if product >= k:
                break
            count += 1
    return count
```

**Complexity:** O(n²) time in the worst case (for example, all ones), O(1) extra space.

## Approach 2: optimal (variable-size sliding window)

**Idea in plain English:** for each right end, find the leftmost start whose product is still below `k`. Because the values are positive, that leftmost start never moves backwards as the right end moves forward: a longer window ending further right has a product at least as large. So keep a window `[left, right]` and its product. Add the new right value; while the product is too big, divide out `nums[left]` and move `left` forward. Then every start from `left` to `right` gives a valid subarray ending at `right`, which is `right − left + 1` subarrays.

Walkthrough on `[4, 2, 6, 1]`, `k = 20`:

| right | value | product after shrink | window | added | total |
|---|---|---|---|---|---|
| 0 | 4 | 4 | [4] | 1 | 1 |
| 1 | 2 | 8 | [4, 2] | 2 | 3 |
| 2 | 6 | 48 -> 12 | [2, 6] | 2 | 5 |
| 3 | 1 | 12 | [2, 6, 1] | 3 | 8 |

```python
def count_product(nums, k):
    if k <= 1:
        return 0
    product = 1
    left = 0
    count = 0
    for right, value in enumerate(nums):
        product *= value
        while product >= k:
            product //= nums[left]      # exact: nums[left] divides product
            left += 1
        count += right - left + 1
    return count
```

**Why it is correct:** every subarray has exactly one right end, so counting the valid subarrays per right end counts each one once. For a fixed right end, the valid starts form a contiguous range ending at `right`, since dropping elements from the left of a positive product only lowers it. The loop leaves `left` at the smallest valid start: everything removed made the product too large, and the window that remains is below `k`. Because `k > 1` and a single positive integer below `k` is valid, the shrink loop never moves `left` past `right` unless `nums[right] >= k`, in which case it stops at `left = right + 1` with product 1 and adds 0.

**Complexity:** O(n) time, as each pointer moves forward at most n times, and O(1) extra space.

## Tests

```python
import random

for f in (count_product, count_product_brute):
    assert f([4, 2, 6, 1], 20) == 8
    assert f([3, 3, 3], 9) == 3
    assert f([5, 1, 1], 1) == 0               # k = 1
    assert f([5, 1, 1], 0) == 0               # k = 0
    assert f([1, 1, 1], 2) == 6               # every subarray
    assert f([100], 100) == 0                 # strict inequality
    assert f([100], 101) == 1
    assert f([], 10) == 0
    assert f([10, 5, 2, 6], 100) == 8

random.seed(713)
for _ in range(500):
    nums = [random.randint(1, 6) for _ in range(random.randint(0, 12))]
    k = random.randint(0, 80)
    assert count_product(nums, k) == count_product_brute(nums, k)

assert count_product([1] * 3000, 2) == 3000 * 3001 // 2   # long input, O(n)
```

## Edge cases and pitfalls

- Return 0 when `k <= 1`. Without the guard the shrink loop divides by elements beyond `right` and eventually indexes past the end.
- The condition is strictly less than `k`. A product equal to `k` does not count.
- The window trick needs positive values. A zero makes every product containing it zero, and negatives make the product flip sign, so "shrinking lowers the product" is no longer true.
- Use integer division when shrinking. Floating-point division drifts after many steps.
- In fixed-width integer languages the product stays below k times the largest element, so it fits if that bound fits; otherwise compare sums of logarithms.

## Where this shows up in data engineering

"Count the windows that stay under a budget" appears in rate limiting and cost control, for example counting contiguous runs of batches whose combined cost multiplier stays under a cap. The add-right, shrink-left window with a "count everything ending here" step is the same pattern behind counting sessions or bursts in event streams.
