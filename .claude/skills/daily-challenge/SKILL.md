---
name: daily-challenge
description: Create a new gittle daily challenge (a level file in levels/ with a daily-date), or a regular level. Use when asked to make, write, generate or schedule a daily challenge or a new gittle puzzle for a date.
---

# Create a gittle daily challenge

The source of truth for the file format and the goal-check vocabulary is `docs/levels.md`; the process and checklist
are in `docs/daily-challenges.md`. Read both before writing. This skill is the workflow plus the house rules.

## What a level is

- One YAML file in the flat `levels/` folder, named by id: `E01…` easy, `M01…` medium, `P01…` pro. The letter must
  match `difficulty`; the number is its place in the list. Fields: `title`, `difficulty`, `daily-date`, `concepts`,
  `brief`, `setup`, `solution`, `goal`. The UI shows it as "P07 · Mixed-up commits".
- `setup` and `solution` are git commands. Commits are referred to by label: `C0` exists at the start, every new commit
  (including merges and reverts) takes the next number, and copies get primes (`C3'`). Merges carry no change; a
  reverted merge carries several.
- `goal` is a list of checks (`docs/levels.md#goals`). The player wins when all pass. Goals say what the brief asks,
  plus guards so cheats can't win (e.g. `unchanged: main`, `applied: [...]` for work that must survive,
  `tags/v1.0` / `heads/main` to insist on a tag or branch, `no-duplicates`).

## Dailies

- A daily is a normal level with `daily-date: YYYY-MM-DD` (regular levels have `daily-date: null`).
- **Medium or pro only.** One per date (the player's local date): pick the first date from today with none
  (`grep -h daily-date levels/*.yaml | sort`) unless the user gives one. Alternate medium and pro by default.
- File name: the **next number at the end** of its difficulty (`ls levels/M*`, `ls levels/P*`, highest + 1).
  Undated levels always come first and dated ones after, in date order; a new *undated* level goes before the dated
  ones, which all move up one number.
- Titles must be unique and never change once released: progress is saved under a key made from the title.
- On its day it's featured at the top of the site and `#/play/daily`, worth **×2 points**, with **no hints**.
  Afterwards it joins the normal list under its difficulty. Future ones are hidden.
- Never change the title, delete, or change the goal of a daily whose date has passed. (Its file number may change.)

## What makes each difficulty

- **Easy** (regular levels only): one new idea, told as part of the player's own first week on the team
  ("you"): first commit, first branch, HEAD, switching, fast-forward, tags. Par 1–3.
- **Medium**: moving work around with one or two everyday tools: merge, rebase, cherry-pick, reset, revert, tags,
  deleting branches, detached HEAD. Recognisable situations; par 1–4 in basic commands.
- **Pro**: real industry problems people hit at work: reverted merges and reverting the revert, merges into the wrong
  branch, wrong bases, secrets mid-branch, backports to release lines, rewritten or force-pushed shared branches,
  stale force-pushes (leases), hotfixes from tags. Usually needs a real insight (`revert -m`, `rebase --onto`, ranges, which merge parent) or several
  coordinated steps. Not just "one rebase".

## The cast

Use **Matt**, **Dan** and **Nikita** by first name only: never "Developer Dan" or "Manager Matt", never pronouns.
Their roles are context, not text:

- **Dan** is the non-sensible engineer. Dan is *always* the one who made the mistake (wrong branch, bad merge,
  force-push, leaked keys, stale rebase about to be force-pushed). Never give a mistake to anyone else.
- **Matt** is the manager: notices, decides, asks or rejects ("Matt wants…", "Matt has rejected it").
- **Nikita** is the sensible engineer. Include Nikita only when the story needs one: Nikita's good work is in the
  repo (a fix, notes, a reviewed commit) and must survive. If the story doesn't need that, leave Nikita out.
- **Talk to the player directly**: "Put the fix on `release/2.1`…", "Get `feature` onto…". Never "Help Nikita…",
  and never make the player Nikita's helper.
- E01 introduces the cast with their roles, once. Everywhere else, first names only.
- Easy levels follow "you" (the player's first weeks on the team) and don't need the cast.

## Remotes

Give a level `origin: true` **only if it's about remotes**: fetching, pulling, pushing, rejected pushes, leases,
recovering from a force-push, pull-request merges. "`main` is shared, so revert it" is *not* about remotes: keep
those local (a trailing `git push` adds nothing). Remote levels use `server:` setup lines for what teammates did
(`docs/levels.md` and `docs/remotes.md`), and goals that check `origin:<branch>` / `in-sync` / `pushed`.

## Before you write: check for similar scenarios

Read the titles, briefs and solutions of **all** existing levels (`levels/*.yaml`, or the table in `docs/levels.md`)
before designing. If an existing level already teaches the same move in the same situation (e.g. "drop a commit from
a private branch" exists as P03 and P11), pick something else. A genuinely new twist on an old idea is fine;
the same puzzle with different names is not.

## Par, under par and points

- **Par = the shortest solution in basic commands**: one action per command. Write `solution` that way. Not basic
  (and so the way strong players beat par): `switch -c`/`checkout -b`, `rebase <upstream> <branch>`,
  `rebase --onto`, several commits or a range in `cherry-pick`/`revert`, `branch -f`, deleting several branches at
  once, `pull` with an explicit branch (`pull --rebase origin main`). `revert -m 1 <merge>`, `fetch`, `pull`,
  `pull --rebase` and every `push` form *are* basic.
- Points: par 100; **+25 per stroke under par** (birdie 125, eagle 150, albatross 175, condor 200); 30% less per
  stroke over par (70, 49, 34…), never below 10. Dailies ×2 on their day.
- A good pro often has a shortcut that beats the basic par (e.g. `rebase --onto` for reset + cherry-picks).
  That's intended: the audit should show it as a Birdie/Eagle.

## Workflow

1. **Pick the date, difficulty and number** (above), and **check for similar scenarios** (above).
2. **Write the file.** Realistic `-m` messages in the setup. The brief says *what* to achieve, not how, talking to
   the player directly; mention labels (`C3`) for commits the player must find. Quote YAML lines containing `: `
   (except `- server: …` lines) and labels with primes. `concepts` appear on level cards and in the filter only.
3. **Validate and iterate until all pass:**
   - `npx vitest run src/levels`: parses, setup doesn't already win, solution wins, every solution step is basic,
     no shorter basic route wins.
   - `npm run levels:audit -- -t <id>`: every way to win in par strokes or fewer with *any* command. Read every
     route. Under-par routes must be genuine shortcuts; anything that wins while breaking something else (deleting
     `main`, undoing other work, borrowing the wrong commit) means the goal needs a guard. The search covers about
     3 strokes; for longer levels, think through shortcuts by hand.
   - `npm run levels:realgit -- -t <id>`: setup and solution give the same result in real git.
4. **Update the level table** in `docs/levels.md` (Level set).
5. **Report** the date, difficulty, id and title, brief, par, the shortcuts that beat par, and anything you were
   unsure about. Don't commit unless asked.
