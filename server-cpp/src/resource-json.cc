#include "sync-http-srv/resource-json.hh"

#if defined(SYNC_HTTP_SRV_ENABLE_JSON_RESOURCES) && SYNC_HTTP_SRV_ENABLE_JSON_RESOURCES

namespace sync_http_srv {
namespace util {
namespace http {

JSON
RESTTraits<JSON>::parse_request_body(const Msg::iContent & c) {
    // TODO: stream wrapper?
    std::string strJson;
    strJson.resize(c.size()+1);
    c.copy_to(strJson.data(), strJson.size());
    return JSON::parse(strJson);
}

void
RESTTraits<JSON>::set_content(ResponseMsg & msg, const JSON & js) {
    assert(!msg.has_content());
    std::ostringstream oss;
    oss << js;
    msg.content(std::make_shared<StringContent>(oss.str()));
}

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

#endif  // defined(SYNC_HTTP_SRV_ENABLE_JSON_RESOURCES) && SYNC_HTTP_SRV_ENABLE_JSON_RESOURCES

