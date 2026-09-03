<!--
  A <select> styled as one of our standard buttons, in one of two modes:

  - Action mode (no `modelValue` prop given): behaves like a menu button
    rather than a value-holder -- always shows a fixed placeholder (`label`,
    e.g. "Add...") and, the moment an option is picked, emits it via
    `select` and immediately resets back to the placeholder. There is no
    "current selection" to hold, and no separate confirm step. Meant to
    replace what would otherwise be a select-then-click-a-button pair
    (CreateScopeToolbar.vue's original "pick a type, then hit +" was the
    first conversion) wherever picking one of a short list of kinds should
    just fire the action right away.

  - Persistent mode (`modelValue` given, v-model-able): an ordinary
    controlled select that keeps showing whichever option is current --
    for a short, closed set of *states* rather than one-shot actions (e.g.
    DiagramViewport.vue's layout direction/alignment, picked from a handful
    of single-glyph options). Emits both `select` and `update:modelValue`
    on every pick, so a caller can use either `v-model` or `@select`.

  Both modes render the same way otherwise (a title/aria-label plus each
  option's own optional `title`, since a closed select can only show one
  tooltip at a time and the point of this component is usually to replace a
  word with a single glyph -- see the option-level tooltip). Deliberately a
  plain <select>, not a hand-rolled popover: native keyboard/click handling
  for free, and style.css's `button, select` and `.button-group`/
  `.toolbar-floating` rules already treat a bare <select> as just another
  button, so this drops into a button group or a hovering toolbar row
  exactly like any other control -- no bespoke CSS needed here.
-->
<template>
  <select
    :value="modelValue"
    :title="title ?? label"
    :aria-label="label"
    @change="on_change"
  >
    <option v-if="modelValue === undefined" value="" disabled hidden selected>{{ label }}</option>
    <option v-for="opt in options" :key="opt.value" :value="opt.value" :title="opt.title">{{ opt.label }}</option>
  </select>
</template>

<script setup>
const props = defineProps({
    label: {type: String, required: true},
    options: {type: Array, required: true}, // [{value, label, title?}]
    // Tooltip for the control as a whole -- defaults to `label`. A caller
    // in persistent mode typically overrides this with something reflecting
    // the *current* option (e.g. "Direction: Left to Right"), since the
    // glyph alone doesn't say that.
    title: {type: String, default: undefined},
    // Persistent mode's current value. Left undefined (the default) for
    // action mode -- see the file header comment above.
    modelValue: {type: String, default: undefined}
});
const emit = defineEmits(['select', 'update:modelValue']);

// Action mode's reset-after-pick is done imperatively here: Vue coerces a
// bound :value of undefined to '' on the DOM element, same as our own
// reset below, so either one alone would already show the placeholder --
// but only the imperative assignment here fires synchronously the moment
// an option is picked, without waiting on a render Vue has no other reason
// to schedule (this component's props never change in action mode).
// Persistent mode never depends on this: its :value is bound to
// modelValue, so Vue's own patching keeps the select in sync once the
// caller updates it in response to `update:modelValue`.
function on_change(event) {
    const value = event.target.value;
    if(!value) return;
    if(props.modelValue === undefined) event.target.value = '';
    emit('select', value);
    emit('update:modelValue', value);
}
</script>
