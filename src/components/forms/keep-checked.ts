/**
 * For a checkbox or a radio button whose ticked state React holds (`checked`), inside a form
 * that has an action.
 *
 * When a form's action has run, React resets the form, and a reset puts every box back to how
 * it was first drawn, not to what React holds: the ticks vanish from the screen while the
 * state still has them, and the two then disagree. (Text fields do not have the problem:
 * React keeps their first-drawn value in step by itself.)
 *
 * Passed as the box's `ref`, this keeps "how it was first drawn" equal to how it is now, so
 * that a reset changes nothing.
 */
export function keepChecked(checked: boolean) {
  return (node: HTMLInputElement | null) => {
    if (node) node.defaultChecked = checked;
  };
}
