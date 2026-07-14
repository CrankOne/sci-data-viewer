class DefaultConfig:
    CORS_HEADERS = "Content-Type"
    # CORS is normally unnecessary when the SPA and API are served by the
    # same process, but it may be enabled for external API consumers
    ENABLE_CORS = False
    DEBUG = False
    # Forces checking plugin protocol
    PLUGIN_LOAD_STRICT = True
