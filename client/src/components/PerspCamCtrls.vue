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
        label="FOV, deg"
        :model-value="camera.fov"
        :min="0.1"
        :max="179"
        :step="0.1"
        @update:model-value="patch({ fov: $event })"
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
        label="Pick max distance"
        :model-value="camera.picking.maxDistance"
        :min="0"
        @update:model-value="
          patch({
            picking: {
              ...camera.picking,
              maxDistance: $event
            }
          })
        "
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
        <output>{{ formattedAspect }}</output>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import NumericField from './NumericField.vue';
import Vector3Field from './Vector3Field.vue';

const props = defineProps({
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

const formattedAspect = computed(
    () => props.aspect.toFixed(4)
);

function patch(value) {
    emit('patch', value);
}
</script>

<style scoped>
.camera-form {
    display: grid;
    gap: 0.4rem;
}

.camera-form__grid {
    display: grid;
    grid-template-columns: repeat(
        auto-fit,
        minmax(6.5rem, 1fr)
    );
    gap: 0.35rem;
}

.readonly-value {
    display: grid;
    gap: 0.15rem;
}

.readonly-value output {
    padding: 0.2rem 0.35rem;
    font-family: monospace;
    text-align: right;
}
</style>
