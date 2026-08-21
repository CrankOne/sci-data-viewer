<template>
  <label class="numeric-field">
    <span class="numeric-field__label">{{ label }}</span>

    <input
      type="number"
      :value="displayValue"
      :min="min"
      :max="max"
      :step="step"
      @change="commit"
      @keydown.enter="$event.currentTarget.blur()"
    >
  </label>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    label: {
        type: String,
        required: true
    },
    modelValue: {
        type: Number,
        required: true
    },
    min: {
        type: Number,
        default: undefined
    },
    max: {
        type: Number,
        default: undefined
    },
    step: {
        type: Number,
        default: undefined
    },
    significantDigits: {
        type: Number,
        default: 7
    }
});

const emit = defineEmits(['update:modelValue']);

const displayValue = computed(() => {
    if (!Number.isFinite(props.modelValue))
        return '';

    return Number(
        props.modelValue.toPrecision(props.significantDigits)
    ).toString();
});

function commit(event) {
    const value = event.currentTarget.valueAsNumber;

    if (Number.isFinite(value))
        emit('update:modelValue', value);
    else
        event.currentTarget.value = displayValue.value;
}
</script>

<style scoped>
.numeric-field {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
}

.numeric-field__label {
    font-size: 0.75rem;
    opacity: 0.8;
}

input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    text-align: right;
}
</style>
