// Builds or repairs the layout tree at store bootstrap (see
// layoutPersistence.js, main.js): a brand-new default tree when nothing was
// persisted, or an upgrade of a tree persisted before the widget-instance
// registry existed (a bare singleton `{kind:'module'}` leaf, and items
// leaves whose `ids` were bare item-type strings rather than instance ids).
//
// Both paths use fixed, well-known ids -- not randomly generated ones --
// for the default context and its widget instances, so their identity (and
// therefore their persisted sub-state: facet presets, selection sets,
// camera presets) is stable across reloads rather than orphaned every time
// the app boots.
import { all_modules } from '@/modules/registry';
import { make_split, make_items_leaf, make_wiring_leaf } from './layout';

export const DEFAULT_CONTEXT_ID = 'ctx-default';

function default_instance_id(itemType) {
    return `wi-default-${itemType.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

// Creates (or, idempotently, no-ops for) the widget instance for `itemType`
// with a fixed, derived-from-itemType id, and returns that id.
function ensure_item_instance(store, itemType, contextId) {
    const instanceId = default_instance_id(itemType);
    store.dispatch('widgetInstances/create_instance', {instanceId, itemType, contextId});
    return instanceId;
}

// v1 supports a single default context, for the first contextual module
// type encountered (today: geo3d, the only one registered). Multiple
// simultaneous default contexts/viewports is a user-initiated action (the
// "create new content" mechanism), not a boot-time concern.
function ensure_default_context() {
    for(const mod of all_modules()) {
        if(mod.contextual) return mod;
    }
    return null;
}

// Builds a brand-new default tree from scratch -- used when nothing was
// persisted at all. Deliberately minimal: a session starts empty, with
// nothing but a place to add sources from and the wiring diagram (store/
// modules/layout.js's 'wiring' leaf kind) -- no scene/viewport is
// pre-created (that's now the wiring widget's own job, via its "New …
// scope" context-menu item or hovering toolbar, same as any other content
// a user creates; see AddSourceModal.vue and AddContentModal.vue for the
// other ways). The wiring widget specifically -- unlike every other piece
// of default content -- is seeded rather than left to "add content" on an
// empty panel: it's the only UI left anywhere in the app for renaming or
// deleting a scope (AppControls.vue's former "Scopes" table and each
// contextual module's own "Send selection to sink" button were retired in
// its favor, doc/ui-session.rst's "Extension points"), so a session with no
// wiring widget present would have no path to either at all.
export function build_default_root(store) {
    const sourcesId = ensure_item_instance(store, 'core:sources', null);
    const appControlsId = ensure_item_instance(store, 'core:appearance', null);
    const leftLeaf = make_items_leaf([sourcesId, appControlsId]);
    const mainLeaf = make_wiring_leaf();
    return make_split('row', 25, [leftLeaf, mainLeaf]);
}

// Replays persisted contexts and widget instances into a fresh store --
// used by layoutPersistence.js when the stored data already includes them
// (as opposed to a pre-instance-registry legacy tree, see
// migrate_legacy_root below). Neither `contexts` nor `widgetInstances` state
// is itself persisted directly; both are runtime-only and rebuilt each load
// by re-issuing the same create_context/create_instance calls that created
// them originally (idempotent, and for contexts this is also what
// re-registers their dynamic view3D_*/transfGroups_*/selection_* modules and reseeds
// their own persistence -- a raw state copy would skip all of that).
// Contexts first, since instances reference them.
export function restore_contexts_and_instances(store, {contexts, instances}) {
    for(const context of Object.values(contexts?.byId ?? {})) {
        store.dispatch('contexts/create_context', {
            id: context.id,
            dataType: context.dataType,
            name: context.name
        });
    }
    for(const instance of Object.values(instances ?? {})) {
        store.dispatch('widgetInstances/create_instance', {
            instanceId: instance.instanceId,
            itemType: instance.itemType,
            contextId: instance.contextId
        });
        if(instance.itemType.endsWith(':module')) {
            store.commit('cameras/register_viewport', {viewportID: instance.instanceId});
        }
    }
}

// Upgrades a persisted pre-instance-registry tree in place. Maps each
// recognized legacy bare-string id onto the same fixed default instance id
// build_default_root() would have used, so an upgraded tree ends up
// indistinguishable from a freshly-bootstrapped one.
export function migrate_legacy_root(root, store) {
    let defaultContextId = null;
    const contextualModule = ensure_default_context();
    if(contextualModule) {
        store.dispatch('contexts/create_context', {
            id: DEFAULT_CONTEXT_ID,
            dataType: contextualModule.dataType,
            name: 'Scene 1'
        });
        defaultContextId = DEFAULT_CONTEXT_ID;
    }

    function contextual_owner(itemType) {
        for(const mod of all_modules()) {
            if((mod.sidePanelSections ?? []).some(section => section.id === itemType))
                return mod.contextual ? defaultContextId : null;
        }
        return null;
    }

    function walk(node) {
        if(node.type === 'split') return {...node, children: node.children.map(walk)};

        if(node.content.kind === 'module') {
            if(node.content.instanceId) return node;
            const dataType = contextualModule?.dataType ?? 'geo3d';
            const instanceId = ensure_item_instance(store, `${dataType}:module`, defaultContextId);
            store.commit('cameras/register_viewport', {viewportID: instanceId});
            return {...node, content: {kind: 'module', instanceId}};
        }

        const ids = node.content.ids.map(id => {
            if(store.getters['widgetInstances/instance'](id)) return id; // already migrated
            return ensure_item_instance(store, id, contextual_owner(id));
        });
        return {...node, content: {...node.content, ids}};
    }

    return walk(root);
}
