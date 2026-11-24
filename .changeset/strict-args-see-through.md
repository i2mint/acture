---
"acture": patch
---

`fromStrictArgs(args, params)` walks pipes and transforms (their input), intersections (both sides), tuples (items and rest), union branches for arrays as well as objects, and record values (a `null` goes where the value type accepts a missing key but not `null`). Where it still cannot see the schema's structure, the value is kept if it parses as given, else its `null` keys are dropped if that parses. A left-out `null` under these schemas no longer reaches `dispatch` and fails validation; a real `null` (a nullable field, a query `{ owner: null }`) is still kept.
