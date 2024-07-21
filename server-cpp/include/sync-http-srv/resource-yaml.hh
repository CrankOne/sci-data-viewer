#pragma once

#include "sync-http-srv/logging.hh"
#include "sync-http-srv/resource.hh"

#if defined(SYNC_HTTP_SRV_ENABLE_YAML_RESOURCES) && SYNC_HTTP_SRV_ENABLE_YAML_RESOURCES

#include <yaml-cpp/yaml.h>

namespace sync_http_srv {
namespace util {
namespace http {

template<>
struct RESTTraits<YAML::Node> {
    static constexpr auto contentTypeStr = "text/x-yaml";
    static YAML::Node parse_request_body(const Msg::iContent *, iJournal &);
    static void set_content(ResponseMsg &, const YAML::Node &, iJournal &);
    static YAML::Node method_not_allowed();
};

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

#endif

