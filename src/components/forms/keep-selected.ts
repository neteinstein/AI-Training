/**
 * For a select whose chosen value React holds (`value`), inside a form that has an action.
 *
 * The same fault as with tick boxes (see `keepChecked`): when the form's action has run, React
 * resets the form, and a reset puts a select back on the option it was first drawn with, not
 * on the one React holds. After a save the list would show the old choice again, and choosing
 * that old choice would then do nothing, because for the browser nothing has changed.
 *
 * Passed as the select's `ref`, this keeps "the option it was first drawn with" equal to the
 * one chosen now, so that a reset changes nothing.
 */
export function keepSelected(value: string) {
  return (node: HTMLSelectElement | null) => {
    if (!node) return;
    for (const option of node.options) option.defaultSelected = option.value === value;
  };
}
