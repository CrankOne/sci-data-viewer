#include "sync-http-srv/resource.hh"

namespace sync_http_srv {
namespace util {
namespace http {

std::shared_ptr<ResponseMsg>
iResource::options( const RequestMsg & rq
                  , const URLParameters & urlParams
                  ) const {
    // TODO: note that OPTIONS also may be used to identify allowed request
    // methods (yes, multiple) -- in that case `Allow' response header must
    // contain a list
    auto r = std::make_shared<ResponseMsg>(Msg::NoContent);
    // The Access-Control-Request-Method request header is used by browsers
    // when issuing a preflight request, to let the server know which HTTP
    // method will be used when the actual request is made. 
    const std::string requestedMethod
            = rq.get_header("Access-Control-Request-Method", "")
        // The Access-Control-Request-Headers request header is used by
        // browsers when issuing a preflight request to let the server know
        // which HTTP headers the client might send when the actual request
        // is made (such as with setRequestHeader()). The complementary
        // server-side header of Access-Control-Allow-Headers will answer
        // this browser-side header.
        , requestHeaders
            = rq.get_header("Access-Control-Request-Headers", "")
        // The Origin request header indicates the origin (scheme, hostname,
        // and port) that caused the request. For example, if a user agent
        // needs to request resources included in a page, or fetched by
        // scripts that it executes, then the origin of the page may be
        // included in the request. 
        , origin
            = rq.get_header("Origin", "")
        ;
    if(requestedMethod.empty()) {
        return r;  // todo: what?
    }
    _L.debug( "TODO: implement response to OPTIONS request." );  // TODO
    //auto it = _allowedHeadersPerMethod.find(requestedMethod);
    //if(it == _allowedHeadersPerMethod.end()) {
    //    // ... TODO
    //}

    // ...
    //r->set_header("Access-Control-Allow-Methods", "POST");
    //r->set_header("Access-Control-Allow-Headers", "Content-Type,Encoding");
    //r->set_header("Access-Control-Max-Age", "5");
    return r;
}

Server::HandleResult
iResource::handle( const RequestMsg & rq
                 , int clientFD
                 , const URLParameters & urlParams) {
    _flags = 0x0;
    if(rq.method() == Msg::OPTIONS) {
        return {_flags, options(rq, urlParams)};
    }
    return {_flags, handle_request(rq, urlParams)};
}

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace na64dp


