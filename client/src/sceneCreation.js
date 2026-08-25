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
