// Fetches the running server's plugin manifest (server_py's
// viewer_plugins blueprint) -- the set of data sources, resolvers and
// client extensions compiled into this server's installed plugins. Used
// by AddSourceModal.vue to offer known sources instead of only free-form
// URL entry.
export async function fetch_plugin_manifest() {
    const response = await fetch("/api/plugins", {
        headers: {Accept: "application/json"}
    });
    if(!response.ok)
        throw new Error(`Could not retrieve viewer plugins: HTTP ${response.status}`);
    return await response.json();
}
