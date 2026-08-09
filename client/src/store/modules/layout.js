// Editable panel layout: a binary tree of splits/panels, resizable, splittable
// and rearrangeable via the splitpanes-driven UI in components/LayoutNode.vue
// and components/Panel.vue. Persisted via layoutPersistence.js (see
// store/persistence.js).
//
// A node is either:
//   {id, type: 'split', direction: 'row'|'column', ratio, children: [node, node]}
//     -- always exactly 2 children, matching a single splitpanes/pane pair.
//     `ratio` is the size (%) of children[0]; children[1] gets 100-ratio.
//   {id, type: 'leaf', content}
//     -- content is either {kind: 'module'} or {kind: 'items', ids: [...]}
//     (a panel holds the 3D-viewer-style module, or a stack of sub-panel
//     items, never both).
import { default_side_panel_item_ids } from '@/modules/panelItems';

let idCounter = 0;
function generate_id(prefix) {
    idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function make_split(direction, ratio, children) {
    return {id: generate_id('split'), type: 'split', direction, ratio, children};
}

function make_module_leaf() {
    return {id: generate_id('panel'), type: 'leaf', content: {kind: 'module'}};
}

function make_items_leaf(ids = []) {
    return {id: generate_id('panel'), type: 'leaf', content: {kind: 'items', ids}};
}

function default_tree() {
    return make_split('row', 75, [
        make_module_leaf(),
        make_items_leaf(default_side_panel_item_ids())
    ]);
}

// Returns a new tree with the node identified by `targetId` replaced by
// `replacer(node)`.
function replace_node(node, targetId, replacer) {
    if(node.id === targetId) return replacer(node);
    if(node.type !== 'split') return node;
    return {...node, children: node.children.map(child => replace_node(child, targetId, replacer))};
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

function clear_module(node) {
    if(node.type === 'leaf') {
        if(node.content.kind !== 'module') return node;
        return {...node, content: {kind: 'items', ids: []}};
    }
    return {...node, children: node.children.map(clear_module)};
}

function find_module_leaf(node) {
    if(node.type === 'leaf') return node.content.kind === 'module' ? node : null;
    for(const child of node.children) {
        const found = find_module_leaf(child);
        if(found) return found;
    }
    return null;
}

export default {
    namespaced: true,

    state: () => ({root: default_tree()}),

    getters: {
        // The id of whichever leaf currently holds the module (there's
        // always exactly one). Used to Teleport the module's component to
        // wherever that leaf's panel renders (see components/ViewerPage.vue,
        // components/Panel.vue) -- the module component itself is mounted
        // exactly once and its DOM is relocated on move, rather than being
        // destroyed/recreated, since that would tear down its whole
        // underlying (e.g. WebGL) state.
        modulePanelId: (state) => find_module_leaf(state.root)?.id ?? null
    },

    mutations: {
        set_root(state, {root}) {
            state.root = root;
        },

        // Shift-drag split: wraps the node identified by `targetId` (a leaf,
        // or an entire split subtree) in a new split, alongside a new empty
        // panel. `ratio` is the resulting size (%) of the split's first
        // child; `newPanelFirst` decides which side the empty panel lands on.
        split_panel(state, {targetId, direction, ratio, newPanelFirst}) {
            state.root = replace_node(state.root, targetId, (node) => {
                const empty = make_items_leaf();
                const children = newPanelFirst ? [empty, node] : [node, empty];
                return make_split(direction, ratio, children);
            });
        },

        // Normal-drag collapse: called once a resize drag ends with an empty
        // panel collapsed below the removal threshold.
        remove_panel(state, {emptyPanelId}) {
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

        move_module(state, {toPanelId}) {
            let root = clear_module(state.root);
            root = replace_node(root, toPanelId, (node) => {
                if(node.type !== 'leaf') return node;
                return {...node, content: {kind: 'module'}};
            });
            state.root = root;
        },

        set_ratio(state, {splitId, ratio}) {
            state.root = replace_node(state.root, splitId, (node) => ({...node, ratio}));
        }
    }
};
