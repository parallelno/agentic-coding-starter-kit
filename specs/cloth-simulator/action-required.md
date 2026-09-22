# Manual prerequisites

None required. No human-only setup steps, and no secrets are needed at any point.

- **Before Wave 2 (Task 02):** `npm ci` must have been run so `three` is resolvable for Tasks 03+ (Task 02 itself does not import three, so Node tests can run without `node_modules` if needed, but `npm test` for later waves requires it). Evidence: `node -e "import('three').then(()=>console.log('ok'))"` exits 0.
- **During final integration (Wave 8):** a browser with WebGL 2 and pointer events (any modern Chrome/Edge/Safari/Firefox). The final scenario is visual/manual and cannot be automated by `npm test`.
- **After implementation:** none.
