# DSA problem list: topics, patterns and the Pattern Wise DSA sheet

The DSA problem list lives in `docs/curriculum/curriculum.json` (`dsa.items`, with the topic and pattern order in
`dsa.topicOrder`). It drives the DSA tracker, the course Practice tab, the interview table order, the question
sidebar and the question previous/next chain. Items are ordered topic → pattern → Easy, Medium, Hard.

Each item has `topic` (problem name), `category` (topic), `pattern` (subfolder) and `difficulty`. Items with a
DataDank solution page have `question`; practice-only items have `slug` (the future page id under
`interview-questions/dsa/`) and a verified `practice` link. When a solution page is written, add `question`, keep
the slug as the file name, and remove `slug`/`practice` from the item: the page's own `practice` frontmatter takes
over and readers' ticks carry over, because ticks are stored by the page address `/interview/dsa/<slug>/`.

## Source: Pattern Wise DSA sheet (2026-10-09)

179 rows in 25 patterns. 43 matched existing DataDank problems by LeetCode link and about 10 more by name
(Pair with Target Sum = Two Sum II, Biggest Island = Max Area of Island, Balanced Parentheses = Generate
Parentheses, Subsets/Permutations, Single Number, Top K Frequent, Scheduling Tasks = Task Scheduler, Target Sum,
Course Schedule I/II, Equal Subset Sum Partition). 92 new problems were added; the three unnamed Island
"Problem Challenge" rows were filled with Island Perimeter (kept) and two dropped problems.

Every new link was confirmed by web search (the platforms are not fetched or scraped): 75 LeetCode, 17
GeeksforGeeks practice pages, none subscription-only. Difficulties are the platforms' own labels.

Dropped as low-value for interviews: LeetCode Premium-only (Index Pairs of a String, Factor Combinations,
Generalized Abbreviation, Rearrange String K Distance Apart, Employee Free Time, Number of Distinct Islands,
Sequence Reconstruction); no real practice judge (generic Cyclic Sort, First K Missing Positive, Maximum CPU Load,
Search in an Infinite Sorted Array); near-duplicates (Top K Numbers, Kth Smallest Number, Kth Smallest in M Sorted
Lists, Minimum Subarray Sum); niche (Count of Range Sum, Kth Smallest in Multiplication Table, Reverse Nodes in
Even Length Groups, Cycle in a Matrix, Largest Palindromic Number, Removing Minimum and Maximum, Split a String Into
Unique Substrings, Maximum Distinct Elements, Sum of Elements Between K1 and K2); trivial (Maximum Number of
Balloons, Flip and Invert an Image, Merge Similar Items, Minimum Vertices to Reach All Nodes). The sheet's Ordered Set
group was folded in: 132 Pattern → Monotonic Stack, My Calendar I → Intervals.
