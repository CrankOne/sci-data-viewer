import SessionPickerModal from '@/components/modals/SessionPickerModal.vue';
import AddSourceModal from '@/components/modals/AddSourceModal.vue';
import AddContentModal from '@/components/modals/AddContentModal.vue';
import ConnectScopeModal from '@/components/modals/ConnectScopeModal.vue';

// Catalog of modal components addressable by name (see store/modules/ui.js,
// components/ModalHost.vue). A name with no entry resolves to null and
// ModalHost shows a fallback rather than throwing, so opening one ahead of
// it existing fails visibly, not silently.
const registry = {
    'session-picker': SessionPickerModal,
    'add-source': AddSourceModal,
    'add-content': AddContentModal,
    'connect-scope': ConnectScopeModal
};

export function resolve_modal(name) {
    return registry[name] ?? null;
}
