// The one, atomic path for bringing a new scene into existence: creates
// the context, its viewport widget instance, registers its camera, and
// places the viewport -- directly into `targetPanelId` if given (a
// specific empty panel the user is filling), otherwise by wrapping the
// entire current layout in a new split, so there's always somewhere valid
// to put it regardless of the current tree shape.
//
// Every "New scene…" option anywhere in the app (AddContentModal,
// AddSourceModal, ConnectScopeModal, AppControls.vue's "+ Add scene")
// MUST go through this rather than calling contexts/create_context
// directly -- that's what guarantees a scene can never exist without a
// viewport (a state the app could previously be walked into, since those
// call sites used to create a bare context on "New scene…" with no
// viewport ever created for it).
export async function create_scene_with_viewport(store, {dataType, name, targetPanelId} = {}) {
    const contextId = await store.dispatch('contexts/create_context', {dataType, name});
    const instanceId = await store.dispatch('widgetInstances/create_instance', {
        itemType: `${dataType}:module`,
        contextId
    });
    store.commit('cameras/register_viewport', {viewportID: instanceId});

    if(targetPanelId) {
        store.commit('layout/place_new_module', {toPanelId: targetPanelId, instanceId});
    } else {
        const newPanelId = `panel-scene-${instanceId}`;
        const rootId = store.state.layout.root.id;
        store.commit('layout/split_panel', {
            targetId: rootId,
            direction: 'row',
            ratio: 50,
            newPanelFirst: false,
            newPanelId
        });
        store.commit('layout/place_new_module', {toPanelId: newPanelId, instanceId});
    }

    return {contextId, instanceId};
}

// The one sanctioned path for deleting a scene, mirroring
// create_scene_with_viewport's role on the other end of the lifecycle --
// used by both AppControls.vue's "Scopes" table and SinkWiringPanel.vue's
// context menu, so "Delete" behaves identically wherever it's invoked from.
// Warns (native confirm) before reassigning away any sources still attached
// (they land unassigned, same as contexts/remove_context's own default),
// and surfaces a failure (e.g. a still-mounted viewport) via native alert
// rather than throwing into the caller.
export async function remove_scene_with_confirmation(store, id) {
    const sources = store.getters['connection/resourcesForContext'](id);
    if(sources.length > 0) {
        const proceed = window.confirm(
            `This scope has ${sources.length} assigned source(s), which will be reassigned elsewhere. Continue?`
        );
        if(!proceed) return;
    }
    try {
        await store.dispatch('contexts/remove_context', {id});
    } catch(error) {
        window.alert(error.message);
    }
}

// The one sanctioned path for removing a module viewport instance --
// formerly Panel.vue's own remove_module, generalized to take an
// instanceId directly (any panel-resolution mechanism can call this, not
// just a Panel.vue instance that happens to hold it -- see
// CleanModeOverlay.vue, which resolves a clicked panel's instanceId off
// the DOM rather than through its own props). Confirms first if this is
// the last viewport for its scene and that scene still has sources
// attached (removing it would reassign those elsewhere, same warning
// remove_scene_with_confirmation gives), then clears the layout leaf,
// drops the widget instance, unregisters its camera/graph-layout state,
// and -- if it really was the last viewport -- removes the now-orphaned
// scene too.
export async function remove_module_instance(store, instanceId) {
    const instance = store.getters['widgetInstances/instance'](instanceId);
    const contextId = instance?.contextId ?? null;

    if(contextId) {
        const remainingViewports = store.getters['widgetInstances/instancesForContext'](contextId)
            .filter(other => other.instanceId !== instanceId && other.itemType.endsWith(':module'));

        if(remainingViewports.length === 0) {
            const sources = store.getters['connection/resourcesForContext'](contextId);
            const scene = store.getters['contexts/context'](contextId);
            if(sources.length > 0) {
                const proceed = window.confirm(
                    `This is the last viewport for "${scene?.name ?? contextId}". Removing it also removes the `
                    + `scope, and its ${sources.length} assigned source(s) will be reassigned elsewhere. Continue?`
                );
                if(!proceed) return;
            }
        }
    }

    store.commit('layout/clear_instance_from_leaf', {instanceId});
    store.commit('widgetInstances/remove_instance', instanceId);
    store.commit('cameras/unregister_viewport', instanceId);
    // Same cleanup, for modules/graph's own per-viewport layout state
    // (doc/module-graph.rst's "Diagrams") -- harmless no-op for any other
    // (non-graph) viewport id, same as the cameras call above.
    store.commit('graphLayout/unregister_viewport', instanceId);

    if(contextId) {
        const remainingViewports = store.getters['widgetInstances/instancesForContext'](contextId)
            .filter(other => other.itemType.endsWith(':module'));
        if(remainingViewports.length === 0) {
            const otherContext = store.getters['contexts/listForType'](instance.itemType.split(':')[0])
                .find(ctx => ctx.id !== contextId);
            try {
                await store.dispatch('contexts/remove_context', {id: contextId, reassignSourcesTo: otherContext?.id});
            } catch(error) {
                console.warn(`Could not remove context "${contextId}":`, error);
            }
        }
    }
}
