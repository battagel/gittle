# gittle

Learn git by seeing it. Solve little repository puzzles by typing real git commands while the commit graph
redraws beside you, in as few commands as you can (golf scoring: hit par, or go under it for a birdie).

- No files, no installs, no account: just commits, branches, HEAD and `origin`.
- Easy, Medium and Pro levels, plus a daily challenge worth double points on its day.
- Progress is saved in your browser.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npx vitest run     # tests
npm run build      # static site in dist/
```

Extra checks for level authors:

```sh
npm run levels:audit     # every way to win each level in par strokes or fewer
npm run levels:realgit   # replay every level through real git and compare
```

## Levels

Each level is a YAML file in [`levels/`](levels): a setup (git commands), the shortest solution using basic
commands (which sets par), a brief, and a goal made of checks. Daily challenges are levels with a `daily-date`.

## Deploying

Every push to `main` runs the tests, builds, and deploys to GitHub Pages
(`.github/workflows/deploy.yml`). In the repository settings, set **Pages → Source** to **GitHub Actions**.

© Matthew Battagel. All rights reserved.
