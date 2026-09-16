# Action-required (manual prerequisites)

**Before implementation**
- None required for Node gates (Node >= 20 present; v24 verified on this machine).

**During implementation**
- T01: nothing (plain files).
- T13 (final gate): a desktop browser with WebGL 2 (any modern Chrome/Edge/Firefox)
  and a static file server (`python -m http.server 8000` or equivalent) to run the
  R-TEST-03 checklist. Completion evidence: every checklist item marked
  pass/fail/deferred in the README checkpoint section.
- Optional, improves final check: a mobile device or DevTools touch emulator for
  the swipe-to-steer item; otherwise record it `deferred` and do not block.
- Optional: `npm i -D three` is expected at T13 (only dependency, R-SCOPE-02);
  no other installs, no secrets, no accounts.

**After implementation**
- Nothing. No commit is made unless explicitly authorized.
