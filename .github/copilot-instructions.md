## Quick context

This repository is a small static website for "The Round Room". It contains a minimal
single-page HTML site with separate CSS and JS files at the repo root:

- `index.html` — entry HTML (currently contains head; add body content here).
- `style.css` — site styles.
- `script.js` — client-side behaviour (currently empty; add DOM code here).
- `images/` — static image assets.

## Big-picture architecture

- No backend, build system, or package manager. Files are served as-is.
- Responsible files live at the repository root (not in `src/` or `public/`).
- Keep presentation in `style.css`, behaviour in `script.js`, structure in `index.html`.

If you need to add new pages, place them alongside `index.html` and link them using
standard anchor tags; keep shared styles/scripts in the root files to avoid duplication.

## Conventions & patterns to follow

- Link assets by relative paths from the project root (e.g., `images/logo.png`).
- Add interactive code inside `script.js`. Wrap code in a DOMContentLoaded listener:

  Example pattern:

  document.addEventListener('DOMContentLoaded', () => {
    // find elements by id or data- attributes
    // keep functions small and well-named
  });

- Place any inline script tags just before the closing `</body>` (or include `defer` in the head).
- Keep CSS in `style.css`. Use BEM-like class names if you introduce complex components.

## Developer workflows

- Preview locally by opening `index.html` in a browser. For a simple local server run from
  project root (recommended for relative asset path parity):

  ```bash
  # Python 3 simple server (macOS / zsh)
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```

- Debugging: use browser DevTools Console and Network tab. Look for 404s when assets are missing.

## Integration points & external dependencies

- Currently none. If you add third-party libraries prefer CDN links in `index.html` or add a
  minimal package manager + build step (document it in README). When adding external scripts,
  annotate their purpose in `index.html` and pin exact versions for reproducibility.

## Examples from this repo

- `index.html` currently defines the site head and links `style.css`. There is no body markup yet —
  when you add content prefer semantic HTML (header/main/footer) and reference classes/ids used
  by `style.css` and `script.js`.

## Edit/PR guidance for AI agents

- Make minimal, self-contained changes. Update only the files required for the feature/bugfix.
- Include a short PR description and a short manual test (e.g., "Open index.html, click X, expect Y").
- If you add new files or change folder structure, update this file and the README.

---

If any section is unclear or you'd like more detail (sample HTML scaffold, local test script,
or a suggested CSS utility set), tell me which part and I will expand it.
