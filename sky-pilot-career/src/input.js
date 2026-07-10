export class InputController {
  constructor() {
    this.keys = new Set();
    this.latched = new Set();
    this.paused = false;

    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (['Space', 'ShiftLeft', 'ControlLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        event.preventDefault();
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      this.latched.delete(event.code);
    });
  }

  pressed(code) {
    return this.keys.has(code);
  }

  axis(positive, negative) {
    return (this.pressed(positive) ? 1 : 0) - (this.pressed(negative) ? 1 : 0);
  }

  once(code) {
    if (!this.pressed(code) || this.latched.has(code)) return false;
    this.latched.add(code);
    return true;
  }
}
