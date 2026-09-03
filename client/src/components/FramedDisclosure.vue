<template>
  <section
    class="framed-disclosure"
    :class="{ 'framed-disclosure--open': modelValue }"
  >
    <div class="framed-disclosure__bar">
      <div class="framed-disclosure__header">
        <button
          type="button"
          class="framed-disclosure__toggle"
          :title="modelValue ? collapseTitle : expandTitle"
          :aria-expanded="modelValue"
          @click="$emit('update:modelValue', !modelValue)"
        >
          <span
            class="vi"
            :class="modelValue
              ? 'vi-chevron-down'
              : 'vi-chevron-right'"
            aria-hidden="true"
          />
        </button>

        <slot name="header" />
      </div>

      <div class="framed-disclosure__actions">
        <slot name="actions" />
      </div>
    </div>

    <div
      v-show="modelValue"
      class="framed-disclosure__content"
    >
      <slot />
    </div>
  </section>
</template>

<script>
export default {
    name: "FramedDisclosure",

    props: {
        modelValue: {
            type: Boolean,
            default: false
        },

        expandTitle: {
            type: String,
            default: "Show details"
        },

        collapseTitle: {
            type: String,
            default: "Hide details"
        }
    },

    emits: [
        "update:modelValue"
    ]
};
</script>
