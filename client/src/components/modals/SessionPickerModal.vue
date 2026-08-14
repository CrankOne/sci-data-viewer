<template>
  <div class="session-picker">
    <h3>{{ mode === 'switch' ? 'Switch session' : 'Welcome' }}</h3>

    <p v-if="mode !== 'switch'" class="intro">
      Load an existing session, or start a new one.
    </p>

    <div v-if="sessions.length" class="session-list">
      <div v-for="s in sessions" :key="s.id" class="session-row">
        <button
          type="button"
          class="session-entry"
          :disabled="s.id === currentSessionId"
          @click="pick(s.id)"
        >
          {{ s.name }}
          <span v-if="s.id === currentSessionId" class="current-tag">(current)</span>
        </button>
        <button
          type="button"
          class="session-remove-btn"
          title="Export session to file"
          aria-label="Export session to file"
          @click="export_to_file(s.id, s.name)"
        >
          <span class="vi vi-save" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="session-remove-btn"
          title="Remove session"
          aria-label="Remove session"
          :disabled="s.id === currentSessionId"
          @click="remove(s.id, s.name)"
        >
          <span class="vi vi-trash-bin" aria-hidden="true" />
        </button>
      </div>
    </div>
    <p v-else class="empty-state">No saved sessions yet.</p>

    <form class="new-session-form" @submit.prevent="create_and_pick">
      <input type="text" v-model.trim="newName" placeholder="New session name">
      <button type="submit">Create</button>
    </form>

    <button type="button" class="import-btn" @click="trigger_import">
      <span class="vi vi-load" aria-hidden="true" /> Import session from file&hellip;
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      class="import-file-input"
      @change="on_import_file"
    >

    <p v-if="error" class="picker-error">{{ error }}</p>

    <button v-if="mode === 'switch'" type="button" @click="$emit('close')">Cancel</button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import { activate_session } from '@/sessionActivation';
import { export_session, import_session } from '@/sessionExport';

const props = defineProps({
    // 'initial': fresh tab, blocking, nothing hydrated yet -- picking
    //   activates in place, no reload needed.
    // 'switch': invoked from an already-running, already-hydrated session
    //   -- picking a *different* session reloads instead (see
    //   sessionActivation.js's header comment for why).
    mode: {type: String, default: 'initial'}
});
const emit = defineEmits(['close']);

const store = useStore();
const router = useRouter();
const sessions = computed(() => store.getters['session/list']);
const currentSessionId = computed(() => store.state.session.activeId);
const newName = ref('');
const error = ref(null);
const fileInput = ref(null);

function switch_to(id) {
    sessionStorage.setItem('viewer.active-session-id', id);
    location.reload();
}

async function pick(id) {
    if(id === currentSessionId.value) return;
    if(props.mode === 'switch') {
        switch_to(id);
        return;
    }
    error.value = null;
    try {
        await activate_session(store, id, {isNew: false, router});
        emit('close');
    } catch(e) {
        error.value = `Could not load session: ${e.message}`;
    }
}

// Deliberately blocked for the currently-active session (button is also
// disabled in that case) -- removing it out from under this tab's already-
// hydrated store, and the sessionStorage pointer still aimed at it, is a
// mess this picker has no clean recovery from.
async function remove(id, name) {
    if(id === currentSessionId.value) return;
    if(!window.confirm(`Remove session "${name}"? This cannot be undone.`)) return;
    await store.dispatch('session/remove_session', id);
}

async function create_and_pick() {
    error.value = null;
    try {
        const id = await store.dispatch('session/create_session', {name: newName.value});
        if(props.mode === 'switch') {
            switch_to(id);
            return;
        }
        await activate_session(store, id, {isNew: true, router});
        emit('close');
    } catch(e) {
        error.value = `Could not create session: ${e.message}`;
    }
}

// Read-only, so allowed even for the currently-active session (unlike
// remove) -- localStorage is always in sync with the live store by the
// time a click handler runs, since every *Persistence.js writes
// synchronously within the same mutation-subscribe tick.
function export_to_file(id, name) {
    error.value = null;
    try {
        const bundle = export_session(store, id);
        const blob = new Blob([JSON.stringify(bundle, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(name || 'session').replace(/[^\w.-]+/g, '_')}.viewer-session.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch(e) {
        error.value = `Could not export "${name}": ${e.message}`;
    }
}

function trigger_import() {
    fileInput.value?.click();
}

async function on_import_file(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // reset so re-picking the same file re-fires @change
    if(!file) return;

    error.value = null;
    try {
        const bundle = JSON.parse(await file.text());
        const id = import_session(store, bundle);
        if(props.mode === 'switch') {
            switch_to(id);
            return;
        }
        await activate_session(store, id, {isNew: false, router});
        emit('close');
    } catch(e) {
        error.value = `Could not import session: ${e.message}`;
    }
}
</script>

<style scoped>
.session-picker {
  display: grid;
  gap: 0.5rem;
  min-width: 16rem;
}

.session-picker h3 {
  margin: 0;
}

.intro {
  margin: 0;
  color: var(--clr-fg-main-muted);
}

.session-list {
  display: grid;
  gap: 0.25rem;
}

.session-row {
  display: flex;
  gap: 0.25rem;
}

.session-entry {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: space-between;
  text-align: left;
}

.session-remove-btn {
  flex: none;
}

.current-tag {
  color: var(--clr-fg-main-muted);
  font-weight: normal;
}

.empty-state {
  color: var(--clr-fg-main-muted);
  font-style: italic;
  margin: 0;
}

.new-session-form {
  display: flex;
  gap: 0.3rem;
}

.new-session-form input {
  flex: 1;
  min-width: 0;
}

.import-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
}

.import-file-input {
  display: none;
}

.picker-error {
  color: var(--clr-fg-main-highlighted);
  margin: 0;
}
</style>
