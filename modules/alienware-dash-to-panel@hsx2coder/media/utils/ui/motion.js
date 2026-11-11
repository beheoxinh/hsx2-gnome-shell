import Clutter from "gi://Clutter";

// Small, shared micro-interactions for popup buttons.
//
// Scale is animated on the actor (St CSS has no `transform`), driven by the
// widget's own `hover` / `pressed` state so it can never get stuck: whatever
// sequence of enter/leave/press/release/grab-break happens, the final scale
// is recomputed from the current state. actor.ease() already honours the
// shell's enable-animations / slow-down settings.

const HOVER_MS = 180;
const PRESS_MS = 90;

/**
 * @param {St.Button} button
 * @param {{hover?: number, press?: number}} [opts]
 * @returns {() => void} disconnect function
 */
export function addPressFeedback(button, { hover = 1.06, press = 0.9 } = {}) {
  button.set_pivot_point(0.5, 0.5);

  const sync = () => {
    if (!button.mapped) {
      button.remove_all_transitions();
      button.set_scale(1, 1);
      return;
    }
    const pressed = button.pressed;
    const target = pressed ? press : button.hover ? hover : 1;
    button.ease({
      scale_x: target,
      scale_y: target,
      duration: pressed ? PRESS_MS : HOVER_MS,
      mode: pressed
        ? Clutter.AnimationMode.EASE_OUT_QUAD
        : Clutter.AnimationMode.EASE_OUT_BACK,
    });
  };

  const ids = [
    button.connect("notify::hover", sync),
    button.connect("notify::pressed", sync),
    // A popup can close while the pointer is over a button; reset so the
    // next open never starts mid-animation or enlarged.
    button.connect("notify::mapped", sync),
  ];

  return () => {
    for (const id of ids) {
      try {
        button.disconnect(id);
      } catch (_e) {}
    }
  };
}

/**
 * Short fade-in, used when content (cover art) is swapped in place.
 * @param {Clutter.Actor} actor
 * @param {number} [ms]
 */
export function fadeIn(actor, ms = 220) {
  if (!actor || !actor.mapped) return;
  actor.remove_transition("opacity");
  actor.opacity = 0;
  actor.ease({
    opacity: 255,
    duration: ms,
    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
  });
}
