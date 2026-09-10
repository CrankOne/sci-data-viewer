// Registry of user-authored JS "transforms" (doc/data-model.rst): a named
// function body, edited via a CodeFlask-based panel (components/modals/
// TransformEditorModal.vue), wired on SinkWiringPanel.vue as its own node
// -- distinct from both a data source and a scope. Has an `out` handle of
// its own, feeding into a context's own `in` the same way a sink link does
// -- store/originResolve.js's `resolve_origin` is what lets a transform be
// just another possible sink *origin* everywhere that mattered (store/
// sinkDispatch.js, store/sinkResolve.js) without those needing to special
// -case it.
//
// A transform is not a viewer module: it has no dataType, no viewport, no
// contextStoreModules -- modules/registry.js knows nothing about it. It's
// app-level plumbing, same tier as `contexts`/`connection`, registered as
// its own top-level store module (main.js).
//
// A feed's source is either a context (selection-driven, mirrors a sink
// link's own membership rule) or -- since a resource's own `out` handle
// can also feed a transform directly -- a resource by name (unconditional,
// mirrors a source link's: whatever the resource's own currently-loaded
// raw payload and, if addressable, its own `selectedItemId` currently are,
// doc/data-model.rst's "One input concept per scope, not two"). Exactly
// one of `originContextId`/`resourceName` is ever set on one feed record;
// a transform never feeds *another* transform (deliberately transform ->
// context only on the output side, no chaining).
//
// A transform is a fan-in: `feedsInto` below (not the record itself --
// there's no `label` field to keep in sync on removal) assigns each of a
// transform's own feeds a stable letter (a, b, c, ...) purely from its
// *position* in insertion order, the same "position is the real identity"
// choice components/LayoutNode.vue's own :key comment makes for a split's
// two children. Removing a middle feed therefore relabels everything after
// it, closing the gap rather than leaving a hole -- matches
// components/SinkWiringPanel.vue's own auto-expanding-inlet UI, where the
// *n*-th connected port is always labeled the *n*-th letter regardless of
// which specific feed record it happens to be. store/originResolve.js's
// transform_snapshot binds each label to that feed's own current items
// (always an array -- a feed's origin can select/hold more than one) as a
// same-named local inside the transform's own function body, e.g. `a`,
// `b`, `c`; store/transformRun.js is what actually compiles that binding.
import { get_module } from '@/modules/registry';

// Spreadsheet-column-style labels (0->a, 1->b, ..., 25->z, 26->aa, ...) --
// open-ended rather than capped at 26, even though a real session is very
// unlikely to ever wire that many feeds into one transform.
export function label_for_index(index) {
    let n = index;
    let label = '';
    do {
        label = String.fromCharCode(97 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
    } while(n >= 0);
    return label;
}

let transformIdCounter = 0;
function generate_transform_id() {
    transformIdCounter += 1;
    return `transform-${Date.now().toString(36)}-${transformIdCounter}`;
}

let feedIdCounter = 0;
function generate_feed_id() {
    feedIdCounter += 1;
    return `feed-${Date.now().toString(36)}-${feedIdCounter}`;
}

let linkIdCounter = 0;
function generate_link_id() {
    linkIdCounter += 1;
    return `tlink-${Date.now().toString(36)}-${linkIdCounter}`;
}

// Deliberately not a no-op comment-only stub: wiring in a first feed
// already proves the wiring end to end (console shows `{a: [...]}`, the
// selected item(s) on port "a", back) before the user has changed a single
// character. References `a` rather than trying to stay valid with zero
// feeds connected -- transform_snapshot below never even attempts to run a
// transform with no feeds at all, so there's no pre-wiring moment where
// referencing a not-yet-existing port could actually surface an error.
const DEFAULT_SOURCE = 'return {a};';

export default {
    namespaced: true,

    state: () => ({
        // outputLinks lives nested per transform (mirrors store/modules/
        // contexts.js's own per-context sinkLinks exactly, including shape
        // -- {targetDataType, targetContextId, payloadType, facetsSelector})
        // rather than a second flat dict, so removing a transform drops its
        // own outgoing links for free along with everything else in its
        // record.
        byId: {},
        order: [],
        // {[feedId]: {originContextId, transformId}} (context-sourced) or
        // {[feedId]: {resourceName, transformId}} (resource-sourced) --
        // see the file header comment. Deliberately separate from
        // contexts.js's own sinkLinks: a transform isn't a context (it has
        // no acceptsPayloadTypes, no receiveSinkMutation), so it can't be a
        // sinkLinks target without forcing that registry to understand a
        // second, unrelated kind of thing.
        feeds: {}
    }),

    getters: {
        list: state => state.order.map(id => state.byId[id]),
        transform: state => id => state.byId[id] ?? null,
        feedsFrom: state => originContextId => Object.entries(state.feeds)
            .filter(([, feed]) => feed.originContextId === originContextId)
            .map(([feedId, feed]) => ({feedId, ...feed})),
        feedsFromResource: state => resourceName => Object.entries(state.feeds)
            .filter(([, feed]) => feed.resourceName === resourceName)
            .map(([feedId, feed]) => ({feedId, ...feed})),
        // The reverse of feedsFrom/feedsFromResource -- "which
        // contexts/resources currently feed this transform", what store/
        // originResolve.js's transform-as-origin needs to gather its own
        // current input, regardless of which kind each feed is. `label`
        // (a/b/c/...) is derived here, from each feed's position in this
        // filtered, insertion-ordered list -- see the file header comment --
        // rather than stored on the feed record, so removing one always
        // relabels the rest into a contiguous a, b, c, ... with no gap.
        feedsInto: state => transformId => Object.entries(state.feeds)
            .filter(([, feed]) => feed.transformId === transformId)
            .map(([feedId, feed], index) => ({feedId, label: label_for_index(index), ...feed})),
        outputLinksFrom: state => transformId => Object.entries(state.byId[transformId]?.outputLinks ?? {})
            .map(([linkId, link]) => ({linkId, ...link})),
        // The label the *next* new feed into this transform would get --
        // components/SinkWiringPanel.vue's own always-present trailing empty
        // inlet (auto-labeled each time the previous one is connected) is
        // this, not a stored value.
        nextFeedLabel: (state, getters) => transformId => label_for_index(getters.feedsInto(transformId).length)
    },

    mutations: {
        add_transform(state, {id, name, source, enabled}) {
            state.byId = {...state.byId, [id]: {id, name, source, enabled, outputLinks: {}}};
            state.order = [...state.order, id];
        },

        remove_transform(state, id) {
            if(!Object.hasOwn(state.byId, id)) return;
            const byId = {...state.byId};
            delete byId[id];
            state.byId = byId;
            state.order = state.order.filter(existing => existing !== id);

            const feeds = {...state.feeds};
            for(const [feedId, feed] of Object.entries(feeds)) {
                if(feed.transformId === id) delete feeds[feedId];
            }
            state.feeds = feeds;
        },

        rename_transform(state, {id, name}) {
            const transform = state.byId[id];
            const trimmed = name?.trim();
            if(!transform || !trimmed) return;
            state.byId = {...state.byId, [id]: {...transform, name: trimmed}};
        },

        set_transform_source(state, {id, source}) {
            const transform = state.byId[id];
            if(!transform) return;
            state.byId = {...state.byId, [id]: {...transform, source}};
        },

        set_transform_enabled(state, {id, enabled}) {
            const transform = state.byId[id];
            if(!transform) return;
            state.byId = {...state.byId, [id]: {...transform, enabled}};
        },

        add_feed(state, {feedId, originContextId, resourceName, transformId}) {
            state.feeds = {...state.feeds, [feedId]: {originContextId, resourceName, transformId}};
        },

        remove_feed(state, feedId) {
            if(!Object.hasOwn(state.feeds, feedId)) return;
            const feeds = {...state.feeds};
            delete feeds[feedId];
            state.feeds = feeds;
        },

        add_output_link(state, {transformId, linkId, targetDataType, targetContextId, payloadType, facetsSelector = null}) {
            const transform = state.byId[transformId];
            if(!transform) return;
            const link = {targetDataType, targetContextId, payloadType, facetsSelector};
            state.byId = {
                ...state.byId,
                [transformId]: {...transform, outputLinks: {...transform.outputLinks, [linkId]: link}}
            };
        },

        remove_output_link(state, {transformId, linkId}) {
            const transform = state.byId[transformId];
            if(!transform || !Object.hasOwn(transform.outputLinks ?? {}, linkId)) return;
            const outputLinks = {...transform.outputLinks};
            delete outputLinks[linkId];
            state.byId = {...state.byId, [transformId]: {...transform, outputLinks}};
        },

        // Persistence-restore only -- replaces the whole slice at once.
        initialize_transforms(state, {byId, order, feeds}) {
            state.byId = byId ?? {};
            state.order = order ?? [];
            state.feeds = feeds ?? {};
        }
    },

    actions: {
        create_transform({commit, state}, {name} = {}) {
            const id = generate_transform_id();
            const label = name?.trim() || `transform-${state.order.length + 1}`;
            commit('add_transform', {id, name: label, source: DEFAULT_SOURCE, enabled: true});
            return id;
        },

        // Mirrors store/modules/contexts.js's own remove_context: cleans up
        // the *target*-side sink inbox of anything this transform is
        // currently an origin for (`removeIncomingOrigin`, same generic
        // hook a removed context already uses) before actually dropping
        // the record -- a transform's own outputLinks are simply gone with
        // it (nested in `byId`), nothing dangles on that side.
        remove_transform({state, commit, rootGetters}, id) {
            if(!state.byId[id]) return;
            for(const ctx of rootGetters['contexts/list']) {
                const module = get_module(ctx.dataType);
                if(!module?.removeIncomingOrigin) continue;
                const mutation = typeof module.removeIncomingOrigin === 'function'
                    ? module.removeIncomingOrigin(ctx.id) : module.removeIncomingOrigin;
                commit(mutation, id, {root: true});
            }
            commit('remove_transform', id);
        },

        // Exactly one of `originContextId`/`resourceName` is expected --
        // see the file header comment.
        create_feed({commit}, {originContextId, resourceName, transformId}) {
            const feedId = generate_feed_id();
            commit('add_feed', {feedId, originContextId, resourceName, transformId});
            return feedId;
        },

        create_output_link({commit}, {transformId, targetDataType, targetContextId, payloadType, facetsSelector = null}) {
            const linkId = generate_link_id();
            commit('add_output_link', {transformId, linkId, targetDataType, targetContextId, payloadType, facetsSelector});
            return linkId;
        },

        // The one sanctioned way to remove *one* output link (SinkWiringPanel
        // .vue's own "Unlink") -- same target-side cleanup remove_transform
        // above already does when the whole transform goes away, just scoped
        // to this one link instead of every link this transform has. Dropping
        // only the link record (the bare `remove_output_link` mutation)
        // leaves the target module's own landing-zone state holding this
        // transform's last-delivered batch forever -- doc/todo's own "unlink
        // does not clear selection".
        remove_output_link({state, commit, rootGetters}, {transformId, linkId}) {
            const link = state.byId[transformId]?.outputLinks?.[linkId];
            commit('remove_output_link', {transformId, linkId});
            if(!link) return;

            const targetContext = rootGetters['contexts/context'](link.targetContextId);
            const targetModule = get_module(targetContext?.dataType);
            if(!targetModule?.removeIncomingOrigin) return;
            const mutation = typeof targetModule.removeIncomingOrigin === 'function'
                ? targetModule.removeIncomingOrigin(link.targetContextId)
                : targetModule.removeIncomingOrigin;
            commit(mutation, transformId, {root: true});
        },

        // Mirrors contexts.js's own remove_context cleanup of sinkLinks
        // pointing at a removed target -- called from there (`{root:
        // true}`) so a removed context's dangling *incoming* feeds (this
        // module's own `feeds`) and any transform's outputLinks pointing
        // at it don't linger.
        remove_feeds_from_context({state, commit}, originContextId) {
            for(const [feedId, feed] of Object.entries(state.feeds)) {
                if(feed.originContextId === originContextId) commit('remove_feed', feedId);
            }
        },

        // Same idea, for a removed *resource* -- called from connection
        // .js's own remove_resource action ({root: true}).
        remove_feeds_from_resource({state, commit}, resourceName) {
            for(const [feedId, feed] of Object.entries(state.feeds)) {
                if(feed.resourceName === resourceName) commit('remove_feed', feedId);
            }
        },

        remove_output_links_to_context({state, commit}, targetContextId) {
            for(const transformId of state.order) {
                for(const [linkId, link] of Object.entries(state.byId[transformId].outputLinks ?? {})) {
                    if(link.targetContextId === targetContextId) commit('remove_output_link', {transformId, linkId});
                }
            }
        }
    }
};
