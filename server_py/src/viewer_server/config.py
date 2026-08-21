class DefaultConfig:
    CORS_HEADERS = "Content-Type"
    # CORS is normally unnecessary when the SPA and API are served by the
    # same process, but it may be enabled for external API consumers
    ENABLE_CORS = False
    DEBUG = False
    # Forces checking plugin protocol
    PLUGIN_LOAD_STRICT = True
    # Plugin ids to load (config file's top-level `plugins` list) and
    # their per-plugin config sections -- see configfile.py. Empty by
    # default so create_app() works standalone (e.g. in tests) without a
    # config file.
    PLUGINS_ENABLED: list = []
    PLUGIN_CONFIGS: dict = {}
