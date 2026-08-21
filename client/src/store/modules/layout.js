// Editable panel layout: a binary tree of splits/panels, resizable, splittable
// and rearrangeable via the splitpanes-driven UI in components/LayoutNode.vue
// and components/Panel.vue. Persisted via layoutPersistence.js (see
// store/persistence.js, store/modules/layoutDefaults.js).
//
// A node is either:
//   {id, type: 'split', direction: 'row'|'column', ratio, children: [node, node]}
//     -- always exactly 2 children, matching a single splitpanes/pane pair.
//     `ratio` is the size (%) of children[0]; children[1] gets 100-ratio.
//   {id, type: 'leaf', content}
//     -- content is either {kind: 'module', instanceId} or
//     {kind: 'items', ids: [instanceId, ...]} (a panel holds one
//     viewport-type widget instance, or an ordered stack of subpanel widget
//     instances, never both).
//
// This module is deliberately scene/context-agnostic -- it only arranges
// and references widget-instance ids (see store/modules/widgetInstances.js);
// which context, if any, an instance is bound to is that module's concern,
// not this one's.

let idCounter = 0;
function generate_id(prefix) {
    idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function make_split(direction, ratio, children) {
    return {id: generate_id('split'), type: 'split', direction, ratio, children};
}

function make_module_leaf(instanceId) {
    return {id: generate_id('panel'), type: 'leaf', content: {kind: 'module', instanceId}};
}

function make_items_leaf(ids = [], id = generate_id('panel')) {
    return {id, type: 'leaf', content: {kind: 'items', ids}};
}

// A harmless placeholder -- store/modules/layoutDefaults.js always commits
// a real, fully-populated root (fresh-built or migrated) via `set_root`
// before the app ever mounts, so this initial value is never actually
// rendered. See main.js.
function default_tree() {
    return make_items_leaf([]);
}

function is_leaf_occupied(node) {
    return node.content.kind === 'module' || node.content.ids.length > 0;
}

// Returns a new tree with the node identified by `targetId` replaced by
// `replacer(node)`.
function replace_node(node, targetId, replacer) {
    if(node.id === targetId) return replacer(node);
    if(node.type !== 'split') return node;
    return {...node, children: node.children.map(child => replace_node(child, targetId, replacer))};
}

function find_leaf(node, id) {
    if(node.type === 'leaf') return node.id === id ? node : null;
    for(const child of node.children) {
        const found = find_leaf(child, id);
        if(found) return found;
    }
    return null;
}

// Replaces the split node whose child is `childId` with that child's
// sibling -- i.e. collapses the split away, promoting the sibling subtree up.
function collapse_child(node, childId) {
    if(node.type !== 'split') return node;

    const idx = node.children.findIndex(child => child.id === childId);
    if(idx !== -1) return node.children[1 - idx];

    return {...node, children: node.children.map(child => collapse_child(child, childId))};
}

function remove_item_id(node, itemId) {
    if(node.type === 'leaf') {
        if(node.content.kind !== 'items' || !node.content.ids.includes(itemId)) return node;
        return {...node, content: {...node.content, ids: node.content.ids.filter(id => id !== itemId)}};
    }
    return {...node, children: node.children.map(child => remove_item_id(child, itemId))};
}

// Clears whichever leaf currently holds `instanceId` -- a module leaf back
// to an empty items leaf, or removed from an items leaf's `ids`. Used both
// by move_module's scoped "steal from elsewhere" step and by the explicit
// removal mutation below.
function clear_instance(node, instanceId) {
    if(node.type === 'leaf') {
        if(node.content.kind === 'module' && node.content.instanceId === instanceId) {
            return {...node, content: {kind: 'items', ids: []}};
        }
        if(node.content.kind === 'items' && node.content.ids.includes(instanceId)) {
            return {...node, content: {...node.content, ids: node.content.ids.filter(id => id !== instanceId)}};
        }
        return node;
    }
    return {...node, children: node.children.map(child => clear_instance(child, instanceId))};
}

function find_leaf_with_module_instance(node, instanceId) {
    if(node.type === 'leaf') {
        return (node.content.kind === 'module' && node.content.instanceId === instanceId) ? node : null;
    }
    for(const child of node.children) {
        const found = find_leaf_with_module_instance(child, instanceId);
        if(found) return found;
    }
    return null;
}

function collect_module_instance_ids(node, acc = []) {
    if(node.type === 'leaf') {
        if(node.content.kind === 'module') acc.push(node.content.instanceId);
        return acc;
    }
    for(const child of node.children) collect_module_instance_ids(child, acc);
    return acc;
}

export {make_split, make_module_leaf, make_items_leaf};

export default {
    namespaced: true,

    state: () => ({root: default_tree()}),

    getters: {
        // The id of whichever leaf currently holds a given module widget
        // instance, or null if it isn't placed anywhere. Used to relocate
        // that instance's mounted component to wherever its panel renders
        // (see components/ViewerPage.vue, components/Panel.vue) -- module
        // components are mounted once per instance and DOM-relocated on
        // move, rather than destroyed/recreated, since that would tear
        // down their underlying (e.g. WebGL) state.
        modulePanelIdForInstance: state => instanceId =>
            find_leaf_with_module_instance(state.root, instanceId)?.id ?? null,

        // Every module widget instance currently placed somewhere in the
        // tree -- components/ViewerPage.vue keeps exactly one mounted
        // component per id in this list.
        mountedModuleInstanceIds: state => collect_module_instance_ids(state.root)
    },

    mutations: {
        set_root(state, {root}) {
            state.root = root;
        },

        // Shift-drag split: wraps the node identified by `targetId` (a leaf,
        // or an entire split subtree) in a new split, alongside a new empty
        // panel. `ratio` is the resulting size (%) of the split's first
        // child; `newPanelFirst` decides which side the empty panel lands on.
        // `newPanelId`, if given, is used as the new empty panel's id instead
        // of a random one -- lets a caller that just issued this mutation
        // immediately target that panel with a follow-up mutation (e.g.
        // place_new_module) without needing split_panel to return a value.
        split_panel(state, {targetId, direction, ratio, newPanelFirst, newPanelId}) {
            state.root = replace_node(state.root, targetId, (node) => {
                const empty = make_items_leaf([], newPanelId);
                const children = newPanelFirst ? [empty, node] : [node, empty];
                return make_split(direction, ratio, children);
            });
        },

        // Normal-drag collapse: called once a resize drag ends with an empty
        // panel collapsed below the removal threshold. A leaf currently
        // holding a module or a non-empty item stack refuses to collapse
        // this way -- that's ordinary layout mechanics, which must never be
        // able to silently lose a mounted viewport or subpanel. Explicit,
        // deliberate removal goes through clear_instance_from_leaf instead.
        remove_panel(state, {emptyPanelId}) {
            const leaf = find_leaf(state.root, emptyPanelId);
            if(leaf && is_leaf_occupied(leaf)) return;
            state.root = collapse_child(state.root, emptyPanelId);
        },

        // Moves itemId into toPanelId, either at the end (beforeItemId
        // omitted/null) or immediately before beforeItemId -- used both for
        // cross-panel moves and same-panel vertical reordering. Resolving
        // the insertion point by id (rather than a numeric index) means the
        // caller doesn't need to account for the list shifting once itemId
        // is removed from its old position.
        move_item(state, {itemId, toPanelId, beforeItemId = null}) {
            let root = remove_item_id(state.root, itemId);
            root = replace_node(root, toPanelId, (node) => {
                if(node.type !== 'leaf' || node.content.kind !== 'items') return node;
                const ids = node.content.ids.filter(id => id !== itemId);
                const insertAt = beforeItemId != null ? ids.indexOf(beforeItemId) : -1;
                ids.splice(insertAt === -1 ? ids.length : insertAt, 0, itemId);
                return {...node, content: {...node.content, ids}};
            });
            state.root = root;
        },

        // Inserts a freshly-created item instance (not currently placed
        // anywhere) into toPanelId -- same insertion mechanics as move_item,
        // minus the "remove from wherever it was" step, since there's
        // nowhere to remove it from.
        insert_new_item(state, {instanceId, toPanelId, beforeItemId = null}) {
            state.root = replace_node(state.root, toPanelId, (node) => {
                if(node.type !== 'leaf' || node.content.kind !== 'items') return node;
                const ids = [...node.content.ids];
                const insertAt = beforeItemId != null ? ids.indexOf(beforeItemId) : -1;
                ids.splice(insertAt === -1 ? ids.length : insertAt, 0, instanceId);
                return {...node, content: {...node.content, ids}};
            });
        },

        // Relocates the module widget instance `instanceId` to toPanelId --
        // clears whichever leaf currently holds *that* instance (if any;
        // a different instance's module leaf elsewhere is untouched) and
        // sets it at the target.
        move_module(state, {toPanelId, instanceId}) {
            let root = clear_instance(state.root, instanceId);
            root = replace_node(root, toPanelId, (node) => {
                if(node.type !== 'leaf') return node;
                return {...node, content: {kind: 'module', instanceId}};
            });
            state.root = root;
        },

        // Places a freshly-created module widget instance (not currently
        // placed anywhere) into toPanelId, which must be an empty items
        // leaf -- same target-leaf mechanics as move_module, minus the
        // scoped-clear step.
        place_new_module(state, {toPanelId, instanceId}) {
            state.root = replace_node(state.root, toPanelId, (node) => {
                if(node.type !== 'leaf' || node.content.kind !== 'items' || node.content.ids.length !== 0) return node;
                return {...node, content: {kind: 'module', instanceId}};
            });
        },

        // Explicit, deliberate removal of a widget instance from wherever
        // it's placed -- a module leaf reverts to an empty items leaf, or
        // the instance is dropped from an items leaf's `ids`. Unlike
        // remove_panel, this always succeeds regardless of occupancy: it
        // *is* the mechanism for removing occupied content, paired with
        // widgetInstances/remove_instance (and, if it was a context's last
        // viewport, contexts/remove_context) by the caller.
        clear_instance_from_leaf(state, {instanceId}) {
            state.root = clear_instance(state.root, instanceId);
        },

        set_ratio(state, {splitId, ratio}) {
            state.root = replace_node(state.root, splitId, (node) => ({...node, ratio}));
        }
    }
};
