```mermaid
graph LR
    Start --- Travel
    Start --- L1[L1 = Closed]
    Start --- Box[Box on A]
    L1 --- Travel
    Box ---|*A* = L1^Box| Travel
    Travel ---|*B = Box| Goal
    Travel --- Room1
    Room1 ---|*C = Box| Room2
```

Solution:

- Don't observe box's location
- Observe no box in Travel room or Room1
- Observe A is locked
- Travel to T-1
- Switch L1 to Open
- Travel to T0
- A must still be locked, but L1 is Open, so Box must not be in Box room\*, and therefore must be in the Goal room\*\* and B is Open
- Travel to goal

\*Note: need to make some way such that the only way it could be in that room is in a place it would open the door.

\*\*Also need some reason it can't just be in an arbitrary location or non-existent
