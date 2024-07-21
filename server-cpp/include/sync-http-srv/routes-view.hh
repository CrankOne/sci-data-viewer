#pragma once

#include "sync-http-srv/server.hh"

namespace sync_http_srv {
namespace util {
namespace http {

/**\brief A simple GET-only endpoint providing list of the available routes
 *
 * Mainly used for debug/development purposes.
 * */
class RoutesView : public Server::iEndpoint {
private:
    const Server::Routes & _routes;
public:
    RoutesView(const Server::Routes & rs) : _routes(rs) {}
    Server::HandleResult handle( const RequestMsg &
                               , int clientFD
                               , const Server::iRoute::URLParameters &
                               ) override;
};

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv


