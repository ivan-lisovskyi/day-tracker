/**
 * Tiny DOM helper: h('div', { class: 'card' }, 'text', childNode)
 * Props starting with "on" become event listeners; everything else is an attribute.
 * Text children are inserted as text nodes, so user input is never parsed as HTML.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === false || value == null) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }

  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return el;
}

/**
 * Redraws a screen without pulling the keyboard away.
 * A redraw requested while the user is in a text/time/number field or a select is postponed
 * until focus leaves the form fields (moving from one field to the next keeps it postponed).
 * Checkboxes and buttons redraw at once.
 */
export function createRenderer(root, draw) {
  let pending = false;

  const isEditing = () => {
    const el = document.activeElement;
    return Boolean(el && root.contains(el) && el.matches('input:not([type="checkbox"]), textarea, select'));
  };

  // Set when the screen is left: a redraw queued just before a tab switch must not paint the old
  // screen over the new one (all tabs share the same root element).
  let disposed = false;

  const drawIfIdle = () => {
    if (disposed) return;
    if (pending && !isEditing()) {
      pending = false;
      draw();
    }
  };

  // Decided on the next tick: a field's "change" fires while focus is in between fields
  // (activeElement is <body>), and only a moment later does it land on the next field.
  let scheduled = false;
  const request = () => {
    pending = true;
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      drawIfIdle();
    }, 0);
  };

  // Leaving the last field draws whatever was postponed.
  const onFocusOut = () => setTimeout(drawIfIdle, 0);

  root.addEventListener('focusout', onFocusOut);
  const dispose = () => {
    disposed = true;
    root.removeEventListener('focusout', onFocusOut);
  };
  return { request, dispose };
}
