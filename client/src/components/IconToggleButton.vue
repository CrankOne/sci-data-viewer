<!--
  Two-state icon toggle button -- shows one of two `vi-*` icons depending
  on `modelValue`, toggling (and emitting `update:modelValue`) on click.
  Same shape as FramedDisclosure.vue's own header button (an icon swapped
  by a boolean prop), pulled out as its own small reusable control here
  since a disclosure's expand/collapse semantics don't fit every ON/OFF
  switch a caller might want (e.g. SinkViewport.vue's "Show metadata
  (dev)"). A plain `.icon-button` otherwise -- drops into a `.button-group`
  or `.toolbar-floating` row exactly like any other icon button.
-->
<template>
  <button
    type="button" class="icon-button icon-toggle-button" :class="{'icon-toggle-button--on': modelValue}"
    :title="modelValue ? titleOn : titleOff" :aria-pressed="modelValue"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="vi" :class="modelValue ? iconOn : iconOff" aria-hidden="true" />
  </button>
</template>

<script setup>
defineProps({
    modelValue: {type: Boolean, required: true},
    iconOn: {type: String, required: true},   // e.g. 'vi-connect-document'
    iconOff: {type: String, required: true},  // e.g. 'vi-document'
    titleOn: {type: String, default: ''},
    titleOff: {type: String, default: ''}
});
defineEmits(['update:modelValue']);
</script>

<style scoped>
.icon-toggle-button--on {
  color: var(--clr-fg-main-highlighted);
}
</style>
