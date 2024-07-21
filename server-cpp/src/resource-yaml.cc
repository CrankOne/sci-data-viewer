#include "sync-http-srv/resource-yaml.hh"
#include "sync-http-srv/error.hh"
#include "sync-http-srv/logging.hh"

#if defined(SYNC_HTTP_SRV_ENABLE_YAML_RESOURCES) && SYNC_HTTP_SRV_ENABLE_YAML_RESOURCES

namespace sync_http_srv {
namespace util {
namespace http {

YAML::Node
RESTTraits<YAML::Node>::parse_request_body( const Msg::iContent * c
                                          , iJournal & L
                                          ) {
    if((!c) || 0 == c->size()) return YAML::Node();
    // TODO: stream wrapper?
    std::string strYaml;
    strYaml.resize(c->size());
    c->copy_to(strYaml.data(), strYaml.size());
    try {
        return YAML::Load(strYaml);
    } catch( std::exception & e ) {
        L.error(util::format("Error while parsing request YAML: %s"
                , e.what()).c_str());
        if( L.debug_enabled() ) {
            std::ostringstream ossd;
            ossd << "request yaml pl of size " << strYaml.size() << ": ";
            for(auto cc : strYaml) {
                if(!std::isspace(cc)) {
                    ossd << "'" << cc << "'";
                } else {
                    ossd << "' '";
                }
                ossd << " (" << (int) cc << "), ";
            }
            L.debug(ossd.str().c_str());
        }  // (dbg) httpServer.messageParsing
        throw e;
    }
}

void
RESTTraits<YAML::Node>::set_content( ResponseMsg & msg
                                   , const YAML::Node & node
                                   , iJournal & L
                                   ) {
    assert(!msg.has_content());

    YAML::Emitter emitter;
    emitter << node;
    msg.content(std::make_shared<StringContent>(emitter.c_str()));
}

YAML::Node
RESTTraits<YAML::Node>::method_not_allowed() {
    YAML::Node node;
    node["errors"] = YAML::Node(YAML::NodeType::Sequence);
    node["errors"][0] = "Method not allowed";
    return node;
}

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

#endif  // #if defined(SYNC_HTTP_SRV_ENABLE_YAML_RESOURCES) && SYNC_HTTP_SRV_ENABLE_YAML_RESOURCES

