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

    <p v-if="error" class="picker-error">{{ error }}</p>

    <button v-if="mode === 'switch'" type="button" @click="$emit('close')">Cancel</button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { activate_session } from '@/sessionActivation';

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
const sessions = computed(() => store.getters['session/list']);
const currentSessionId = computed(() => store.state.session.activeId);
const newName = ref('');
const error = ref(null);

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
        await activate_session(store, id, {isNew: false});
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
        await activate_session(store, id, {isNew: true});
        emit('close');
    } catch(e) {
        error.value = `Could not create session: ${e.message}`;
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

.picker-error {
  color: var(--clr-fg-main-highlighted);
  margin: 0;
}
</style>
