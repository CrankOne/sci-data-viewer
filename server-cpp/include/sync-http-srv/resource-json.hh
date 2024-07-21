#pragma once

#include "sync-http-srv/resource.hh"

#include <nlohmann/json.hpp>

namespace sync_http_srv {
namespace util {
namespace http {

using JSON = nlohmann::json;

template<>
struct RESTTraits<JSON> {
    static constexpr auto contentTypeStr = "application/json";
    static JSON parse_request_body(const Msg::iContent &);
    static void set_content(ResponseMsg &, const JSON &);
};

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv
