/**
 * Keyboard input: arrows / WASD queue direction changes into the game.
 * R restarts only after death (full UI restart flow arrives in M8).
 * Touch swipe support lands here in M8.
 */
const KEY_DIRS = {
  ArrowUp:    { x: 0, z: -1 }, KeyW: { x: 0, z: -1 },
  ArrowDown:  { x: 0, z: 1 },  KeyS: { x: 0, z: 1 },
  ArrowLeft:  { x: -1, z: 0 }, KeyA: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },  KeyD: { x: 1, z: 0 }
};

/**
 * @param {() => void} onRestart
 * @param {import('./events.js').Events} events
 */
export function bindInput(game, onRestart, events) {
  const onKey = (e) => {
    if (e.code === 'KeyR') {
      if (!game.alive) onRestart();
      return;
    }
    if (!game.alive) return;
    const dir = KEY_DIRS[e.code];
    if (!dir) return;
    e.preventDefault();
    game.queueDir(dir);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}