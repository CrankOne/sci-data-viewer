#include "sync-http-srv/routes-view.hh"

namespace sync_http_srv {
namespace util {
namespace http {

Server::HandleResult
RoutesView::handle( const RequestMsg & rq
                  , int clientFD
                  , const Server::iRoute::URLParameters & urlParams
                  ) {
    auto r = std::make_shared<ResponseMsg>(Msg::Ok);
    if(rq.method() != Msg::GET) {
        throw errors::RequestError("Method Not Allowed.", Msg::MethodNotAllowed);
    }
    // TODO: negotiate format
    r->set_header("content-type", "application/json");

    std::ostringstream oss;
    oss << "{" << std::endl
        << "  \"routes\":[";
    bool isFirstRoute = true;
    for(auto entry : _routes) {
        if(isFirstRoute) isFirstRoute = false;
        else oss << ",";
        oss << std::endl
            << "    {" << std::endl
            << "      \"name\": \"" << entry.first->name << "\"," << std::endl
            << "      \"type\": ";
        const RegexRoute * rxRoutPtr = dynamic_cast<const RegexRoute*>(entry.first);
        if(rxRoutPtr) {
            // escape slashes in path pattern
            std::string pathPattern(rxRoutPtr->in_pattern()); {
                size_t pos = 0;
                while((pos = pathPattern.find("\\", pos)) != std::string::npos) {
                     pathPattern.replace(pos, 1, "\\\\");
                     pos += 2;
                }
            }

            oss << "\"regex-based\"," << std::endl
                << "      \"pathPattern\": \""
                    << pathPattern
                    << "\"," << std::endl
                << "      \"pathTemplate\": \"" << rxRoutPtr->path_template()
                    << "\"," << std::endl
                << "      \"groups\": [";
            bool isFirstGroup = true;
            for(const auto & group : rxRoutPtr->match_groups()) {
                if(isFirstGroup) isFirstGroup = false;
                else oss << ", ";
                oss << "[" << group.first << ", \""
                    << group.second << "\"]";
            }  // for-group-in-regex-route
            oss << "]" << std::endl;
        }  // if-regex-route
        // ... other route types?
        oss << "    }" << std::endl;
    }  // for routes
    oss << "  ]" << std::endl
        << "}" << std::endl;

    r->content(std::make_shared<StringContent>(oss.str()));

    return {0x0, r};
}

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

