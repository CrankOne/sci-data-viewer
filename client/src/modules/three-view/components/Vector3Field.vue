<template>
  <fieldset class="vector-field">
    <legend>{{ label }}</legend>

    <NumericField
      label="X"
      :model-value="modelValue[0]"
      :step="step"
      @update:model-value="set_component(0, $event)"
    />
    <NumericField
      label="Y"
      :model-value="modelValue[1]"
      :step="step"
      @update:model-value="set_component(1, $event)"
    />
    <NumericField
      label="Z"
      :model-value="modelValue[2]"
      :step="step"
      @update:model-value="set_component(2, $event)"
    />
  </fieldset>
</template>

<script setup>
import NumericField from '@/components/NumericField.vue';

const props = defineProps({
    label: {
        type: String,
        required: true
    },
    modelValue: {
        type: Array,
        required: true,
        validator: value =>
            value.length === 3 &&
            value.every(Number.isFinite)
    },
    step: {
        type: Number,
        default: undefined
    }
});

const emit = defineEmits(['update:modelValue']);

function set_component(index, value) {
    const next = [...props.modelValue];
    next[index] = value;
    emit('update:modelValue', next);
}
</script>

<style scoped>
.vector-field {
    display: grid;
    grid-template-columns: repeat(3, minmax(5rem, 1fr));
    gap: 0.35rem;

    margin: 0;
    padding: 0.35rem;
    border: 1px solid var(--clr-border-inactive);
}

legend {
    padding-inline: 0.25rem;
}
</style>
