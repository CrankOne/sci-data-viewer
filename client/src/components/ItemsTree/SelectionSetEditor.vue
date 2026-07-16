<template>
  <section class="selection-set-editor">
    <div class="selection-set-header">
      <label for="selection-set">
        Selection <span>({{ selectedItemCount }}/{{ selectedMarkerCount }})</span>
      </label>

      <select
        id="selection-set"
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

      <button
        type="button"
        class="editor-toggle"
        :title="expanded
          ? 'Hide selection-set controls'
          : 'Show selection-set controls'"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <span
          class="vi"
          :class="expanded
            ? 'vi-minus-framed'
            : 'vi-plus-framed'"
          aria-hidden="true"
        />
      </button>
    </div>

    <div
      v-show="expanded"
      class="selection-set-body"
    >
      <div class="selection-toolbar">
        <button
          type="button"
          title="Save selection set"
          @click="save"
        >
          <span class="vi vi-save" aria-hidden="true" />
        </button>

        <button
          type="button"
          title="Delete saved selection set"
          :disabled="!activeSetName"
          @click="$emit('delete-set', activeSetName)"
        >
          <span class="vi vi-trash-bin" aria-hidden="true" />
        </button>

        <span class="separator"/>

        <button
          type="button"
          :disabled="!activeSetName"
          title="Replace current selection with saved set"
          @click="apply('replace')"
        >
          <span class="vi vi-select-saved" aria-hidden="true" />
        </button>

        <button
          type="button"
          :disabled="!activeSetName"
          title="Append saved set to current selection"
          @click="apply('union')"
        >
          <span class="vi vi-boolean-union" aria-hidden="true" />
        </button>

        <button
          type="button"
          :disabled="!activeSetName"
          title="Remove saved set from current selection"
          @click="apply('subtract-saved')"
        >
          <span class="vi vi-boolean-subtraction" aria-hidden="true" />
        </button>

        <button
          type="button"
          :disabled="!activeSetName"
          title="Keep only elements common to current and saved selections"
          @click="apply('intersection')"
        >
          <span class="vi vi-boolean-intersection" aria-hidden="true" />
        </button>

        <button
          type="button"
          :disabled="!activeSetName"
          title="Set selection to saved set minus current selection"
          @click="apply('saved-minus-current')"
        >
          <span
            class="vi vi-boolean-subtraction-inverted"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: "SelectionSetEditor",

  props: {
    setNames: {
      type: Array,
      required: true
    },

    activeSetName: {
      type: String,
      default: null
    },

    selectedItemCount: {
      type: Number,
      required: true
    },

    selectedMarkerCount: {
      type: Number,
      required: true
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
        const name = window.prompt("Selection set name:");
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
.selection-set-editor {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}

.selection-set-header {
  display: grid;
  grid-template-columns:
    auto
    minmax(0, 1fr)
    1.8rem;

  align-items: center;
  gap: 0.3rem;
}

.selection-set-header label {
  color: var(--clr-fg-main-muted);
  font-size: 0.85rem;
}

.selection-set-header select {
  width: 100%;
  min-width: 0;
}

.editor-toggle {
  display: inline-grid;
  place-items: center;

  width: 1.8rem;
  height: 1.8rem;
  padding: 0;

  border: 1px solid var(--clr-border-inactive);
  background: var(--clr-bg-options);
  color: var(--clr-fg-options);
}

.selection-set-body {
  display: grid;
  gap: 0.35rem;

  padding: 0.4rem;
  border: 1px solid var(--clr-border-inactive);
  background: var(--clr-bg-options);
}

button:disabled {
  opacity: 0.35;
  cursor: default;
}

.selection-toolbar {
    display: flex;
    align-items: center;
    gap: .2rem;
    flex-wrap: wrap;
}

.selection-toolbar button {
    width: 1.8rem;
    height: 1.8rem;

    display: inline-grid;
    place-items: center;

    padding: 0;
}

.separator {
    width: 1px;
    align-self: stretch;
    margin: 0 .15rem;

    background: var(--clr-border-inactive);
}
</style>
