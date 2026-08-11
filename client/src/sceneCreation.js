// The one, atomic path for bringing a new scene into existence: creates
// the context, its viewport widget instance, registers its camera, and
// places the viewport -- directly into `targetPanelId` if given (a
// specific empty panel the user is filling), otherwise by wrapping the
// entire current layout in a new split, so there's always somewhere valid
// to put it regardless of the current tree shape.
//
// Every "New scene…" option anywhere in the app (AddContentModal,
// AddSourceModal, ConnectScopeModal, AppearanceCtrls.vue's "+ Add scene")
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
