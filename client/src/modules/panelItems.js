// Metadata for everything that can appear as a stand-alone item inside a
// sub-panel-container panel (see components/Panel.vue, components/LayoutNode.vue):
// two "core" items owned by the app shell, plus whatever the active viewer
// module contributes via its own sidePanelSections. Items are addressed by a
// stable id so the layout tree (store/modules/layout.js) can reference them
// without holding onto components directly.
import SourceList from '@/components/SourcesList.vue';
import AppControls from '@/components/AppControls.vue';
import { get_module, all_modules } from './registry';

// Display-grouping label for the "Add content" modal's two-level list
// (doc/ui-session.rst's "Extension points"). Purely cosmetic -- an item
// with no explicit `category` falls back to its owning module's own
// `label` (see all_side_panel_items below), so a future module's items get
// their own bucket for free without touching this file.
export const CATEGORY_APP = 'Application subpanels';
export const CATEGORY_COMMON_SCOPE = 'Common scope subpanels';
export const CATEGORY_SCENE_3D = '3D scene';

const CORE_SOURCES = {id: 'core:sources', title: 'Data Sources', component: SourceList, category: CATEGORY_APP};
// NOTE: `id` stays 'core:appearance' despite the component's rename to
// AppControls.vue -- it's persisted inside every saved session's layout
// tree (store/modules/layoutPersistence.js), so changing it would orphan
// existing sessions' references to this panel.
const CORE_APP_CONTROLS = {
    id: 'core:appearance', title: 'Application Controls', component: AppControls, category: CATEGORY_APP
};

export function available_side_panel_items(activeType) {
    const moduleItems = get_module(activeType)?.sidePanelSections ?? [];
    return [CORE_SOURCES, ...moduleItems, CORE_APP_CONTROLS];
}

export function resolve_side_panel_item(id, activeType) {
    return available_side_panel_items(activeType).find(item => item.id === id) ?? null;
}

// Every known item type (core + every registered module's sidePanelSections),
// regardless of which data type is "active" -- a layout leaf now references
// a widget instance that already carries its own itemType (see
// store/modules/widgetInstances.js), so resolving its component no longer
// needs the old single-global-activeType gating above.
export function all_side_panel_items() {
    const moduleItems = all_modules().flatMap(mod =>
        (mod.sidePanelSections ?? []).map(item => ({category: mod.label, ...item}))
    );
    return [CORE_SOURCES, ...moduleItems, CORE_APP_CONTROLS];
}

export function resolve_item_type(itemType) {
    return all_side_panel_items().find(item => item.id === itemType) ?? null;
}

// Used only to seed the layout's default tree, before any data source is
// connected (so `activeType` isn't meaningful yet) -- includes every
// registered module's items rather than just the active one's.
export function default_side_panel_item_ids() {
    const moduleIds = all_modules().flatMap(mod => (mod.sidePanelSections ?? []).map(item => item.id));
    return [CORE_SOURCES.id, ...moduleIds, CORE_APP_CONTROLS.id];
}
