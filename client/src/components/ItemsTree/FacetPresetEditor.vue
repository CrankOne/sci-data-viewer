<template>
  <section class="preset-editor">
    <div class="preset-header">
      <label for="facet-preset">
        View
      </label>

      <select
        id="facet-preset"
        :value="activePresetName"
        @change="$emit('activate-preset', $event.target.value)"
      >
        <option
          v-for="name in presetNames"
          :key="name"
          :value="name"
        >
          {{ name }}
        </option>
      </select>

      <button
        type="button"
        class="editor-toggle"
        :title="editorExpanded
          ? 'Hide view editor'
          : 'Edit view preset'"
        :aria-expanded="editorExpanded"
        aria-controls="facet-preset-editor-body"
        @click="editorExpanded = !editorExpanded"
      >
        <span
          class="vi"
          :class="editorExpanded
            ? 'vi-plus-framed'
            : 'vi-minus-framed'"
          aria-hidden="true"
        />
      </button>
    </div>

    <div
      v-show="editorExpanded"
      id="facet-preset-editor-body"
      class="preset-editor-body"
    >
      <div class="preset-actions">
        <button
          type="button"
          title="Update preset"
          @click="$emit('update-preset')"
        >
          <span class="vi vi-update-saved" aria-hidden="true" />
          <span class="action-label">Update</span>
        </button>

        <button
          type="button"
          title="Save as a new preset"
          @click="saveAs"
        >
          <span class="vi vi-save" aria-hidden="true" />
          <span class="action-label">Save as</span>
        </button>

        <button
          type="button"
          title="Delete preset"
          :disabled="presetNames.length <= 1"
          @click="$emit('delete-preset', activePresetName)"
        >
          <span class="vi vi-trash-bin" aria-hidden="true" />
          <span class="action-label">Delete</span>
        </button>
      </div>

      <div class="facet-zone-row">
        <span class="zone-label">
          Group by
        </span>

        <div
          class="facet-zone"
          @dragover.prevent
          @drop="dropAtEnd('active')"
        >
          <button
            v-for="(facet, index) in activeFacets"
            :key="facet"
            type="button"
            class="facet-chip active"
            draggable="true"
            :title="`Grouping level ${index + 1}`"
            @dragstart="
              startDrag(facet, 'active', index, $event)
            "
            @dragend="finishDrag"
            @dragover.prevent
            @drop.stop="dropBefore(index)"
            @dblclick="deactivate(facet)"
          >
            <span class="vi vi-drag" aria-hidden="true" />
            <span>{{ facet }}</span>
            <span class="facet-level">
              {{ index + 1 }}
            </span>
          </button>

          <span
            v-if="activeFacets.length === 0"
            class="zone-placeholder"
          >
            No grouping
          </span>
        </div>
      </div>

      <div class="facet-zone-row">
        <span class="zone-label">
          Available
        </span>

        <div
          class="facet-zone"
          @dragover.prevent
          @drop="dropAtEnd('inactive')"
        >
          <button
            v-for="(facet, index) in inactiveFacets"
            :key="facet"
            type="button"
            class="facet-chip"
            draggable="true"
            @dragstart="
              startDrag(facet, 'inactive', index, $event)
            "
            @dragend="finishDrag"
            @dblclick="activate(facet)"
          >
            <span class="vi vi-drag" aria-hidden="true" />
            <span>{{ facet }}</span>
          </button>

          <span
            v-if="inactiveFacets.length === 0"
            class="zone-placeholder"
          >
            No additional facets
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: "FacetPresetEditor",

  props: {
    presetNames: {
      type: Array,
      required: true
    },

    activePresetName: {
      type: String,
      required: true
    },

    activeFacets: {
      type: Array,
      required: true
    },

    inactiveFacets: {
      type: Array,
      required: true
    }
  },

  emits: [
    "activate-preset",
    "set-active-facets",
    "save-preset",
    "update-preset",
    "delete-preset"
  ],

  data() {
    return {
      editorExpanded: false,
      dragged: null
    };
  },

  methods: {
    startDrag(facet, zone, index, event) {
      this.dragged = {
        facet,
        zone,
        index
      };

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", facet);
    },

    finishDrag() {
      this.dragged = null;
    },

    activate(facet) {
      if (this.activeFacets.includes(facet))
        return;

      this.$emit("set-active-facets", [
        ...this.activeFacets,
        facet
      ]);
    },

    deactivate(facet) {
      this.$emit(
        "set-active-facets",
        this.activeFacets.filter(
          name => name !== facet
        )
      );
    },

    dropAtEnd(zone) {
      if (!this.dragged)
        return;

      if (zone === "inactive")
        this.deactivate(this.dragged.facet);
      else
        this.moveToActive(this.activeFacets.length);

      this.finishDrag();
    },

    dropBefore(targetIndex) {
      if (!this.dragged)
        return;

      this.moveToActive(targetIndex);
      this.finishDrag();
    },

    moveToActive(targetIndex) {
      const facet = this.dragged.facet;
      const next = this.activeFacets.filter(
        name => name !== facet
      );

      if (
        this.dragged.zone === "active" &&
        this.dragged.index < targetIndex
      ) {
        --targetIndex;
      }

      targetIndex = Math.max(
        0,
        Math.min(targetIndex, next.length)
      );

      next.splice(targetIndex, 0, facet);

      this.$emit("set-active-facets", next);
    },

    saveAs() {
      const name = window.prompt("Preset name:");

      if (!name?.trim())
        return;

      this.$emit("save-preset", name.trim());
    }
  }
};
</script>

<style scoped>
.preset-editor {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}

.preset-header {
  display: grid;
  grid-template-columns:
    auto
    minmax(0, 1fr)
    1.8rem;

  align-items: center;
  gap: 0.3rem;
}

.preset-header label {
  color: var(--clr-fg-main-muted);
  font-size: 0.85rem;
}

.preset-header select {
  min-width: 0;
  width: 100%;
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
  cursor: pointer;
}

.editor-toggle:hover {
  background: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}

.preset-editor-body {
  display: grid;
  gap: 0.35rem;

  padding: 0.4rem;
  border: 1px solid var(--clr-border-inactive);
  background: var(--clr-bg-options);
}

.preset-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.preset-actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;

  min-height: 1.8rem;
  padding: 0.15rem 0.45rem;

  border: 1px solid var(--clr-border-inactive);
  background: var(--clr-bg-main);
  color: var(--clr-fg-main);
  cursor: pointer;
}

.preset-actions button:hover:not(:disabled) {
  background: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}

.preset-actions button:disabled {
  opacity: 0.4;
  cursor: default;
}

.action-label {
  font-size: 0.8rem;
}

.facet-zone-row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  align-items: start;
  gap: 0.3rem;
}

.zone-label {
  padding-top: 0.3rem;
  color: var(--clr-fg-main-muted);
  font-size: 0.8rem;
}

.facet-zone {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;

  min-height: 1.9rem;
  padding: 0.25rem;

  border: 1px solid var(--clr-border-inactive);
  background: var(--clr-bg-main);
}

.facet-chip {
  display: inline-grid;
  grid-template-columns: auto auto;
  align-items: center;
  gap: 0.2rem;

  padding: 0.12rem 0.35rem;

  border: 1px solid var(--clr-border-inactive);
  background: var(--clr-bg-options);
  color: var(--clr-fg-options);

  cursor: grab;
}

.facet-chip.active {
  grid-template-columns: auto auto auto;
  background: var(--clr-bg-highlight1);
  color: var(--clr-fg-highlight1);
}

.facet-level {
  min-width: 1.2em;
  text-align: center;
  border-radius: 50%;
  background: rgb(0 0 0 / 15%);
  font-size: 0.75em;
}

.zone-placeholder {
  padding: 0.1rem 0.2rem;
  color: var(--clr-fg-main-muted);
  font-size: 0.8rem;
  font-style: italic;
}
</style>
