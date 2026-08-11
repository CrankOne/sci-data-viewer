import { read_stored, write_stored } from '@/store/persistence';
import { build_default_root, migrate_legacy_root, restore_contexts_and_instances } from './layoutDefaults';

const BASE_STORAGE_KEY = 'viewer.layout.v1';

// Any mutation from these modules can change what needs to be persisted --
// prefix-matched (rather than an explicit list of mutation types) so a
// newly-added mutation in any of them is covered automatically instead of
// silently falling through an incomplete list.
const PERSIST_PREFIXES = ['layout/', 'contexts/', 'widgetInstances/'];

// Unlike the other *Persistence.js modules, this one doesn't delegate to
// the generic install_persistence() helper: populating the tree isn't a
// plain "commit whatever was stored" -- it must first build a fresh default
// tree (nothing stored), restore previously-persisted contexts/instances
// (already-current data), or migrate a legacy pre-instance-registry tree
// (see layoutDefaults.js) -- all of which have real side effects (creating
// contexts, registering dynamic modules) the generic helper has no hook for.
//
// `contexts` and `widgetInstances` state is not itself persisted as raw
// state (see restore_contexts_and_instances's doc comment) -- instead this
// module's own storage entry additionally carries enough to replay their
// creation, alongside the layout tree that references them.
//
// `sessionId` scopes the storage key to one saved session (see
// store/modules/session.js, sessionActivation.js) -- each session gets its
// own independent layout/contexts/instances.
export function install_layout_persistence(store, sessionId) {
    const storageKey = `${BASE_STORAGE_KEY}.${sessionId}`;
    const stored = read_stored(storageKey, 'root');

    let root;
    if(stored?.contexts && stored?.instances) {
        restore_contexts_and_instances(store, stored);
        root = stored.root;
    } else if(stored) {
        root = migrate_legacy_root(stored.root, store);
    } else {
        root = build_default_root(store);
    }
    store.commit('layout/set_root', {root});

    store.subscribe((mutation, rootState) => {
        if(!PERSIST_PREFIXES.some(prefix => mutation.type.startsWith(prefix))) return;
        write_stored(storageKey, {
            root: rootState.layout.root,
            contexts: rootState.contexts,
            instances: rootState.widgetInstances.byId
        });
    });
}
