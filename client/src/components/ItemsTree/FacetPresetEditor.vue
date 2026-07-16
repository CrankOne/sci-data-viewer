<template>
  <FramedDisclosure
    v-model="editorExpanded"
    expand-title="Edit view preset"
    collapse-title="Hide view preset editor"
  >
    <template #header>
      <label
        for="facet-preset"
        class="facet-preset-label"
      >
        View
      </label>

      <div class="facet-preset-select-wrap">
        <select
          id="facet-preset"
          class="facet-preset-select"
          :value="activePresetName"
          @change="activateSelectedPreset"
        >
          <option
            v-for="name in presetNames"
            :key="name"
            :value="name"
          >
            {{ name }}
          </option>
        </select>

        <span
          v-if="hasUnsavedChanges"
          class="unsaved-marker"
          title="This view preset has unsaved changes"
          aria-label="Unsaved changes"
        >
          •
        </span>
      </div>
    </template>

    <template #actions>
      <button
        type="button"
        class="header-action"
        title="Save changes to the current preset (update)"
        aria-label="Save changes to the current preset"
        :disabled="!hasUnsavedChanges"
        @click="$emit('update-preset')"
      >
        <span
          class="vi vi-update-saved"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="header-action"
        title="Save as a new preset"
        aria-label="Save as a new preset"
        @click="saveAs"
      >
        <span
          class="vi vi-save"
          aria-hidden="true"
        />
      </button>

      <button
        type="button"
        class="header-action"
        title="Delete current preset"
        aria-label="Delete current preset"
        :disabled="presetNames.length <= 1"
        @click="$emit('delete-preset', activePresetName)"
      >
        <span
          class="vi vi-trash-bin"
          aria-hidden="true"
        />
      </button>
    </template>

    <div class="facet-editor-body">
      <div class="facet-zone-row">
        <span class="zone-label">
          Group by
        </span>

        <div
          class="facet-zone facet-zone--active"
          :class="{
            'facet-zone--drag-target':
              dragTargetZone === 'active'
          }"
          @dragenter.prevent="dragTargetZone = 'active'"
          @dragover.prevent
          @dragleave="leaveZone('active', $event)"
          @drop="dropAtEnd('active')"
        >
          <button
            v-for="(facet, index) in activeFacets"
            :key="facet"
            type="button"
            class="facet-chip facet-chip--active"
            draggable="true"
            :title="`Grouping level ${index + 1}; double-click to remove`"
            @dragstart="
              startDrag(facet, 'active', index, $event)
            "
            @dragend="finishDrag"
            @dragenter.prevent
            @dragover.prevent
            @drop.stop="dropBefore(index)"
            @dblclick="deactivate(facet)"
          >
            <span
              class="vi vi-drag facet-chip__handle"
              aria-hidden="true"
            />

            <span class="facet-chip__label">
              {{ facet }}
            </span>

            <span
              class="facet-chip__level"
              :aria-label="`Grouping level ${index + 1}`"
            >
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
          class="facet-zone facet-zone--inactive"
          :class="{
            'facet-zone--drag-target':
              dragTargetZone === 'inactive'
          }"
          @dragenter.prevent="dragTargetZone = 'inactive'"
          @dragover.prevent
          @dragleave="leaveZone('inactive', $event)"
          @drop="dropAtEnd('inactive')"
        >
          <button
            v-for="(facet, index) in inactiveFacets"
            :key="facet"
            type="button"
            class="facet-chip"
            draggable="true"
            title="Double-click to add this facet"
            @dragstart="
              startDrag(facet, 'inactive', index, $event)
            "
            @dragend="finishDrag"
            @dblclick="activate(facet)"
          >
            <span
              class="vi vi-drag facet-chip__handle"
              aria-hidden="true"
            />

            <span class="facet-chip__label">
              {{ facet }}
            </span>
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
  </FramedDisclosure>
</template>

<script>
import FramedDisclosure from "../FramedDisclosure.vue";

export default {
  name: "FacetPresetEditor",

  components: {
    FramedDisclosure
  },

  props: {
    presetNames: {
      type: Array,
      required: true
    },

    activePresetName: {
      type: String,
      required: true
    },

    /*
     * Current working facet order. This may differ from the saved preset.
     */
    activeFacets: {
      type: Array,
      required: true
    },

    /*
     * Facet order stored in the currently selected named preset.
     */
    savedFacets: {
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

      /*
       * {
       *   facet: string,
       *   zone: "active" | "inactive",
       *   index: number
       * }
       */
      dragged: null,

      dragTargetZone: null
    };
  },

  computed: {
    hasUnsavedChanges() {
      if (this.activeFacets.length !== this.savedFacets.length)
        return true;

      return this.activeFacets.some(
        (facet, index) => facet !== this.savedFacets[index]
      );
    }
  },

  methods: {
    activateSelectedPreset(event) {
      this.$emit(
        "activate-preset",
        event.target.value
      );
    },

    startDrag(facet, zone, index, event) {
      this.dragged = {
        facet,
        zone,
        index
      };

      this.dragTargetZone = zone;

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", facet);
    },

    finishDrag() {
      this.dragged = null;
      this.dragTargetZone = null;
    },

    leaveZone(zone, event) {
      /*
       * Moving between children of the same drop zone also emits dragleave.
       * Clear the indication only when the pointer actually leaves the zone.
       */
      if (
        this.dragTargetZone === zone &&
        !event.currentTarget.contains(event.relatedTarget)
      ) {
        this.dragTargetZone = null;
      }
    },

    activate(facet) {
      if (this.activeFacets.includes(facet))
        return;

      this.$emit(
        "set-active-facets",
        [...this.activeFacets, facet]
      );
    },

    deactivate(facet) {
      this.$emit(
        "set-active-facets",
        this.activeFacets.filter(
          activeFacet => activeFacet !== facet
        )
      );
    },

    dropAtEnd(zone) {
      if (!this.dragged)
        return;

      if (zone === "active") {
        this.moveToActive(this.activeFacets.length);
      } else {
        this.deactivate(this.dragged.facet);
      }

      this.finishDrag();
    },

    dropBefore(targetIndex) {
      if (!this.dragged)
        return;

      this.moveToActive(targetIndex);
      this.finishDrag();
    },

    moveToActive(targetIndex) {
      if (!this.dragged)
        return;

      const { facet, zone, index } = this.dragged;

      /*
       * Remove the dragged facet first. This handles both reordering an
       * active facet and moving an inactive facet into the active list.
       */
      const next = this.activeFacets.filter(
        activeFacet => activeFacet !== facet
      );

      /*
       * Removing an active facet before the insertion position shifts the
       * target index to the left.
       */
      if (
        zone === "active" &&
        index < targetIndex
      ) {
        --targetIndex;
      }

      targetIndex = Math.max(
        0,
        Math.min(targetIndex, next.length)
      );

      next.splice(targetIndex, 0, facet);

      this.$emit(
        "set-active-facets",
        next
      );
    },

    saveAs() {
      const name = window.prompt(
        "View preset name:"
      )?.trim();

      if (!name)
        return;

      this.$emit(
        "save-preset",
        name
      );
    }
  }
};
</script>

<style scoped>
.facet-preset-label {
  flex: none;

  color: var(--clr-fg-main-muted);
  font-size: 0.85rem;
  white-space: nowrap;
}

.facet-preset-select-wrap {
  position: relative;

  min-width: 0;
  width: min(100%, 16rem);
}

.facet-preset-select {
  width: 100%;
  min-width: 0;

  /*
   * Leave room for the unsaved marker before the native select arrow.
   */
  padding-right: 1.8rem;
}

.unsaved-marker {
  position: absolute;
  top: 50%;
  right: 1.25rem;

  transform: translateY(-53%);

  color: var(--clr-fg-highlight1);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;

  pointer-events: none;
}

.header-action {
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

.header-action:hover:not(:disabled) {
  background: var(--clr-bg-highlight2);
  color: var(--clr-fg-highlight2);
}

.header-action:disabled {
  opacity: 0.35;
  cursor: default;
}

.facet-editor-body {
  display: grid;
  gap: 0.4rem;

  min-width: 0;
}

.facet-zone-row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  align-items: start;
  gap: 0.35rem;

  min-width: 0;
}

.zone-label {
  padding-top: 0.35rem;

  color: var(--clr-fg-main-muted);
  font-size: 0.8rem;
  white-space: nowrap;
}

.facet-zone {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;

  min-width: 0;
  min-height: 2rem;
  padding: 0.25rem;

  border: 1px solid var(--clr-border-inactive);
  border-radius: 0.2rem;

  background: var(--clr-bg-main);

  transition:
    border-color 100ms ease,
    background-color 100ms ease;
}

.facet-zone--drag-target {
  border-color: var(--clr-border-active);

  background:
    color-mix(
      in srgb,
      var(--clr-bg-highlight2) 15%,
      var(--clr-bg-main)
    );
}

.facet-chip {
  display: inline-grid;
  grid-template-columns: auto minmax(0, auto);
  align-items: center;
  gap: 0.25rem;

  max-width: 100%;
  min-height: 1.65rem;
  padding: 0.1rem 0.35rem;

  border: 1px solid var(--clr-border-inactive);
  border-radius: 0.2rem;

  background: var(--clr-bg-options);
  color: var(--clr-fg-options);

  cursor: grab;
}

.facet-chip--active {
  grid-template-columns:
    auto
    minmax(0, auto)
    auto;

  background: var(--clr-bg-highlight1);
  color: var(--clr-fg-highlight1);
}

.facet-chip:hover {
  border-color: var(--clr-border-active);
}

.facet-chip:active {
  cursor: grabbing;
}

.facet-chip__handle {
  color: var(--clr-fg-main-muted);
  pointer-events: none;
}

.facet-chip__label {
  min-width: 0;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.facet-chip__level {
  display: inline-grid;
  place-items: center;

  min-width: 1.25em;
  height: 1.25em;
  padding-inline: 0.15em;

  border-radius: 999px;
  background: rgb(0 0 0 / 15%);

  font-size: 0.72em;
  line-height: 1;
}

.zone-placeholder {
  padding: 0.1rem 0.2rem;

  color: var(--clr-fg-main-muted);
  font-size: 0.8rem;
  font-style: italic;

  pointer-events: none;
}

@media (max-width: 28rem) {
  .facet-zone-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.15rem;
  }

  .zone-label {
    padding-top: 0;
  }
}
</style>
