<template>
  <FramedDisclosure
    v-model="expanded"
    expand-title="Show selection operations"
    collapse-title="Hide selection operations"
  >
    <template #header>
      <label
        for="selection-set"
        class="selection-set-label"
      >
        Selection
      </label>

      <select
        id="selection-set"
        class="selection-set-select"
        :value="activeSetName ?? ''"
        :disabled="setNames.length === 0"
        @change="$emit('activate-set', $event.target.value)"
      >
        <option
          v-if="setNames.length === 0"
          value=""
        >
          No saved sets
        </option>

        <option
          v-for="name in setNames"
          :key="name"
          :value="name"
        >
          {{ name }}
        </option>
      </select>
    </template>

    <div class="selection-toolbar">
      <button
        type="button"
        title="Save current selection"
        @click="save"
      >
        <span class="vi vi-save" aria-hidden="true" />
      </button>

      <button
        type="button"
        title="Delete saved selection"
        :disabled="!activeSetName"
        @click="$emit('delete-set', activeSetName)"
      >
        <span class="vi vi-trash-bin" aria-hidden="true" />
      </button>

      <span class="selection-toolbar__separator" />

      <button
        type="button"
        title="Replace current selection with saved set"
        :disabled="!activeSetName"
        @click="apply('replace')"
      >
        <span class="vi vi-select-saved" aria-hidden="true" />
      </button>

      <button
        type="button"
        title="Append saved set"
        :disabled="!activeSetName"
        @click="apply('union')"
      >
        <span class="vi vi-boolean-union" aria-hidden="true" />
      </button>

      <button
        type="button"
        title="Subtract saved set"
        :disabled="!activeSetName"
        @click="apply('subtract-saved')"
      >
        <span class="vi vi-boolean-subtraction" aria-hidden="true" />
      </button>

      <button
        type="button"
        title="Keep common elements"
        :disabled="!activeSetName"
        @click="apply('intersection')"
      >
        <span
          class="vi vi-boolean-intersection"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        title="Saved set minus current selection"
        :disabled="!activeSetName"
        @click="apply('saved-minus-current')"
      >
        <span
          class="vi vi-boolean-subtraction-inverted"
          aria-hidden="true"
        />
      </button>
    </div>
  </FramedDisclosure>
</template>

<script>
import FramedDisclosure from "../FramedDisclosure.vue";

export default {
  name: "SelectionSetEditor",

  components: {
    FramedDisclosure
  },

  props: {
    setNames: {
      type: Array,
      required: true
    },

    activeSetName: {
      type: String,
      default: null
    }
  },

  emits: [
    "activate-set",
    "save-set",
    "update-set",
    "delete-set",
    "apply-set"
  ],

  data() {
    return {
      expanded: false
    };
  },

  methods: {
    save() {
      if (this.activeSetName) {
        this.$emit("update-set");
        return;
      }

      const name = window.prompt("Selection-set name:");

      if (name?.trim())
        this.$emit("save-set", name.trim());
    },

    apply(operation) {
      this.$emit("apply-set", {
        name: this.activeSetName,
        operation
      });
    }
  }
};
</script>

<style scoped>
.selection-set-label {
  flex: none;

  color: var(--clr-fg-main-muted);
  font-size: 0.85rem;
  white-space: nowrap;
}

.selection-set-select {
  min-width: 0;
  width: min(100%, 16rem);
}

.selection-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.2rem;
}

.selection-toolbar button {
  display: inline-grid;
  place-items: center;

  width: 1.8rem;
  height: 1.8rem;
  padding: 0;

  border: 1px solid var(--clr-border-inactive);
  border-radius: 0.2rem;

  background: var(--clr-bg-options);
  color: var(--clr-fg-options);
  cursor: pointer;
}

.selection-toolbar button:hover:not(:disabled) {
  background: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}

.selection-toolbar button:disabled {
  opacity: 0.35;
  cursor: default;
}

.selection-toolbar__separator {
  align-self: stretch;

  width: 1px;
  min-height: 1.4rem;
  margin-inline: 0.2rem;

  background: var(--clr-border-inactive);
}
</style>
