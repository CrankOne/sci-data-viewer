<template>
  <div class="camera-form">
    <Vector3Field
      label="Position"
      :model-value="camera.position"
      @update:model-value="patch({ position: $event })"
    />

    <Vector3Field
      label="Look-at target"
      :model-value="camera.target"
      @update:model-value="patch({ target: $event })"
    />

    <Vector3Field
      label="Up vector"
      :model-value="camera.up"
      :step="0.01"
      @update:model-value="patch({ up: $event })"
    />

    <div class="camera-form__grid">
      <NumericField
        label="Scene width"
        :model-value="camera.width"
        :min="0.000001"
        @update:model-value="patch({ width: $event })"
      />

      <NumericField
        label="Near"
        :model-value="camera.near"
        :min="0.000001"
        @update:model-value="patch({ near: $event })"
      />

      <NumericField
        label="Far"
        :model-value="camera.far"
        :min="camera.near"
        @update:model-value="patch({ far: $event })"
      />

      <NumericField
        label="Pick radius, px"
        :model-value="camera.picking.radiusPx"
        :min="0"
        :step="0.5"
        @update:model-value="
          patch({
            picking: {
              ...camera.picking,
              radiusPx: $event
            }
          })
        "
      />

      <div class="readonly-value">
        <span>Aspect</span>
        <output>{{ aspect.toFixed(4) }}</output>
      </div>
    </div>
  </div>
</template>

<script setup>
import NumericField from '@/components/NumericField.vue';
import Vector3Field from './Vector3Field.vue';

defineProps({
    camera: {
        type: Object,
        required: true
    },
    aspect: {
        type: Number,
        required: true
    }
});

const emit = defineEmits(['patch']);

function patch(value) {
    emit('patch', value);
}
</script>
