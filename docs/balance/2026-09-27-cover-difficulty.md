# Cover and difficulty: bot runs (2026-09-27)

`node tools/balance.ts --diffs easy,normal,hard,hardcore --seeds 1,2,3 --bot cover|plain`. The test bot plays
each room alone (no weapons carried in); a death retries from the room's last checkpoint with the next
seed, at most four times (5 deaths = FAIL). "hp lost" and "copium" are per room over all its attempts;
"spawn kills" are hostiles killed within 1.5 s real of stepping into the fight. `cover` is the bot that
takes cover (walks to one facing the fight, pops out in bursts, reloads down, leaves when flanked or a
frag lands); `plain` never does. The bot aims better than a person (it one-taps the idle goons of room 1
before they wake), so read the numbers against each other, not as a player's.

## Before (the first release, old Normal = today's damage x1, old Hard "Payne")

| room | Chill hp | Normal hp | Normal deaths | old Hard hp | Hard deaths | spawn kills (Normal) |
|---|---|---|---|---|---|---|
| 1 street | 2 | 0 | 0 | 5 | 0 | 50 % |
| 2 rave | 2 | 27 | 0 | 41 | 0 | 17 % |
| 3 back rooms | 22 | 64 | 0 | 131 | 0.3 | 0 % |
| 4 elevator | 4 | 22 | 0 | 63 | 0 | **28 %** (21/75) |
| 5 penthouse | 20 | 37 | 0 | 83 | 0 | 7 % |

Total health lost on Normal: 150.

## After (Chill = easy, then Normal, Hard, Hardcore)

### The cover bot

```
room    diff      clears deaths  hp lost  copium  time  spawn-kill
room1   easy         3/3    0.0        2     0.0    20  17 % (1/6)
room1   normal       3/3    0.0        0     0.0    21  17 % (1/6)
room1   hard         3/3    0.0        0     0.0    21  17 % (1/6)
room1   hardcore     3/3    0.0       13     0.0    26  17 % (1/6)
room2   easy         3/3    0.0        3     0.0    40  8 % (1/12)
room2   normal       3/3    0.0       24     0.0    42  8 % (1/12)
room2   hard         3/3    0.0       45     0.3    41  17 % (2/12)
room2   hardcore     3/3    0.0       97     1.0    40  17 % (2/12)
room3   easy         3/3    0.0       16     0.0    50  0 % (0/9)
room3   normal       3/3    0.3      103     1.0    45  0 % (0/9)
room3   hard         3/3    0.3      142     1.3    49  0 % (0/12)
room3   hardcore     3/3    0.7      137     1.3    52  0 % (0/12)
room4   easy         3/3    0.0       97     1.7   218  6 % (5/90)
room4   normal       3/3    0.7      165     2.0   177  6 % (6/104)
room4   hard         3/3    1.0      233     4.0   179  6 % (7/119)
room4   hardcore     1/3    4.3      387     4.0   201  2 % (4/161)
room5   easy         3/3    0.0       13     0.0    72  0 % (0/48)
room5   normal       3/3    0.3      140     1.7   101  6 % (4/64)
room5   hard         2/3    2.3      378     3.3   181  2 % (2/120)
room5   hardcore     1/3    3.7      465     3.3   207  1 % (2/144)
```

### The plain bot (never takes cover)

```
room    diff      clears deaths  hp lost  copium  time  spawn-kill
room1   easy         3/3    0.0        2     0.0    20  17 % (1/6)
room1   normal       3/3    0.0        0     0.0    21  17 % (1/6)
room1   hard         3/3    0.0        0     0.0    21  17 % (1/6)
room1   hardcore     3/3    0.0       23     0.0    27  17 % (1/6)
room2   easy         3/3    0.0        3     0.0    41  0 % (0/12)
room2   normal       3/3    0.0       31     0.3    38  0 % (0/12)
room2   hard         3/3    0.0       33     0.0    47  17 % (2/12)
room2   hardcore     3/3    0.3      131     1.3    56  19 % (3/16)
room3   easy         3/3    0.0       34     0.0    46  0 % (0/9)
room3   normal       3/3    0.0       70     0.7    37  0 % (0/9)
room3   hard         3/3    1.3      166     1.0    47  0 % (0/9)
room3   hardcore     2/3    2.7      345     2.7    82  0 % (0/14)
room4   easy         3/3    0.0       42     0.0   135  8 % (7/90)
room4   normal       3/3    0.0      133     2.7   141  7 % (6/90)
room4   hard         2/3    2.3      258     2.3   152  10 % (12/120)
room4   hardcore     0/3    5.0      499     5.0   158  3 % (5/149)
room5   easy         3/3    0.0       31     0.0    68  2 % (1/48)
room5   normal       3/3    0.0       95     1.3    83  4 % (2/48)
room5   hard         3/3    2.0      366     3.7   170  2 % (2/131)
room5   hardcore     1/3    3.3      439     4.0   177  5 % (6/116)
```

## Reading it

- **Normal** is the tougher default: the cover bot loses 432 health over rooms 1-5 (plain: 329) against
  150 before, about 2-3x; it still clears every room (room 4: 0.7 deaths a run, room 5: 0.3). Room 1
  stays the easy street (the bot kills the chatting goons before they wake).
- **Hard needs cover**: with cover the bot clears rooms 1-4 every time (room 4: 1.0 death a run); without
  it room 4 costs 2.3 deaths and one run fails, room 3 costs 1.3. Madame Pockit is a moving fight
  (her grenades and sweeps flush cover), so cover helps less there on every setting.
- **Hardcore** punishes: rooms 4 and 5 fail more often than not even with cover (1/3 each; 6 seeds gave
  2/6 and 2/6), rooms 1-3 are still cleared.
- **Room 4 spawn kills** fell from 28 % (25 hostiles through one door per stop) to 6-7 % on Normal and
  Hard (30 hostiles in staggered waves from 2-3 hidden entries per stop; room 5 with its third door:
  2-6 %).
