// Metadata for everything that can appear as a stand-alone item inside a
// sub-panel-container panel (see components/Panel.vue, components/LayoutNode.vue):
// two "core" items owned by the app shell, plus whatever the active viewer
// module contributes via its own sidePanelSections. Items are addressed by a
// stable id so the layout tree (store/modules/layout.js) can reference them
// without holding onto components directly.
import SourceList from '@/components/SourcesList.vue';
import AppearanceCtrls from '@/components/AppearanceCtrls.vue';
import { get_module, all_modules } from './registry';

const CORE_SOURCES = {id: 'core:sources', title: 'Data Sources', component: SourceList};
const CORE_APPEARANCE = {id: 'core:appearance', title: 'Appearance and controls', component: AppearanceCtrls};

export function available_side_panel_items(activeType) {
    const moduleItems = get_module(activeType)?.sidePanelSections ?? [];
    return [CORE_SOURCES, ...moduleItems, CORE_APPEARANCE];
}

export function resolve_side_panel_item(id, activeType) {
    return available_side_panel_items(activeType).find(item => item.id === id) ?? null;
}

// Used only to seed the layout's default tree, before any data source is
// connected (so `activeType` isn't meaningful yet) -- includes every
// registered module's items rather than just the active one's.
export function default_side_panel_item_ids() {
    const moduleIds = all_modules().flatMap(mod => (mod.sidePanelSections ?? []).map(item => item.id));
    return [CORE_SOURCES.id, ...moduleIds, CORE_APPEARANCE.id];
}
