#pragma once

#include "sync-http-srv/logging.hh"
#include "sync-http-srv/server.hh"

#include <unordered_map>
#include <unordered_set>
#include <cassert>

namespace sync_http_srv {
namespace util {
namespace http {

template<typename ContentT> struct RESTTraits;
// ^^^
//    static Msg::iContent parse_request_body( const JSON &);
//    static void set_content(ResponseMsg, const JSON &);

/**\brief Represents RESTful API resource
 *
 * Payload-type agnostic shim routing resource implementations. Performs basic
 * URL matching and parameter extraction, forwards execution
 * to GET/PUT/POST/PATCH/DELETE methods respecting the HTTP request.
 * */
class iResource : public Server::iEndpoint {
public:
    using URLParameters = Server::iRoute::URLParameters;
private:
    // These internal fields are only valid during work of particular methods
    uint16_t _flags;
protected:
    iJournal & _L;

    void _set_no_dispatch_response() { _flags |= Server::kNoDispatchResponse; }
    void _set_server_exit() { _flags |= Server::kStop; }
public:
    iResource( iJournal & logCat
             ) : _flags(0x0)
               , _L(logCat)
               {}

    Server::HandleResult handle( const RequestMsg &
                               , int clientFD
                               , const URLParameters &) override;
    /// Response for OPTIONS request
    virtual std::shared_ptr<ResponseMsg> options( const RequestMsg &, const URLParameters &) const;
    /// Should handle request types other than OPTIONS
    virtual std::shared_ptr<ResponseMsg> handle_request(const RequestMsg &, const URLParameters &) = 0;
};


/// Helper class for resource specialized on certain content type
template<typename T>
class SpecializedResource : public iResource {
private:
    std::shared_ptr<ResponseMsg> _currentResponse;
    const RequestMsg * _currentRequstMsgPtr;
protected:
    ResponseMsg & _current_response_object() {
        assert(_currentResponse);
        return *_currentResponse;
    }
    const RequestMsg & _current_request_object() {
        assert(_currentRequstMsgPtr);
        return *_currentRequstMsgPtr;
    }
public:
    SpecializedResource( iJournal & logCat
                       ) : iResource(logCat)
                         {}

    std::shared_ptr<ResponseMsg> handle_request(const RequestMsg &, const URLParameters &) override;

    virtual T method_not_allowed()
        { return RESTTraits<T>::method_not_allowed(); }

    ///\brief HTTP GET method used to retrieve resources wrt URI
    virtual T get( const T &, const URLParameters & )
            { return method_not_allowed(); }
    ///\brief HTTP POST method used to create new resources
    ///
    /// This method is *not* idempotent.
    virtual T post( const T &, const URLParameters & )
            { return method_not_allowed(); }
    ///\brief HTTP PUT method is used to create/update resource as a whole
    ///
    /// This method *must* be idempotent and used to update resource as a whole
    /// (roughly speaking, PUT'ed payload has to be similar to what client GETs)
    virtual T put( const T &, const URLParameters & )
            { return method_not_allowed(); }
    ///\brief HTTP PATCH is used to partially update existing resource
    ///
    /// Not necessarily idempotent, but can be. Used to involved advanced
    /// creation logic.
    virtual T patch( const T &, const URLParameters & )
            { return method_not_allowed(); }
    ///\brief HTTP DELETE used to delete resource
    virtual T delete_( const T &, const URLParameters & )
            { return method_not_allowed(); }
    ///\brief Called for other HTTP methods
    virtual T unknown_method( const T &, const URLParameters & )
            { return method_not_allowed(); }
};

template<typename T> std::shared_ptr<ResponseMsg>
SpecializedResource<T>::handle_request( const RequestMsg & rq
                                      , const URLParameters & urlParams
                                      ) {
    T (SpecializedResource<T>::*mptr)(const T&, const URLParameters &);
    switch(rq.method()) {
        case Msg::GET:
            mptr = &SpecializedResource<T>::get;
            break;
        case Msg::POST:
            mptr = &SpecializedResource<T>::post;
            break;
        case Msg::PUT:
            mptr = &SpecializedResource<T>::put;
            break;
        case Msg::DELETE:
            mptr = &SpecializedResource<T>::delete_;
            break;
        case Msg::PATCH:
            mptr = &SpecializedResource<T>::patch;
            break;
        default:
            mptr = &SpecializedResource<T>::unknown_method;
            break;
    }

    _currentResponse = std::make_shared<ResponseMsg>(Msg::Ok);
    assert(_currentResponse);
    _currentRequstMsgPtr = &rq;
    assert(_currentRequstMsgPtr);

    auto payload = (this->*mptr)( RESTTraits<T>::parse_request_body(rq.content().get(), _L)
                                , urlParams
                                );
    if( !_currentResponse->has_content() ) {
        RESTTraits<T>::set_content( *_currentResponse
                                  , payload
                                  , _L
                                  );
        // Set content-type header if content is not empty and header missed
        // (otherwise, handlers might prefer to set custom content and its type)
        if( _currentResponse->has_content()
         && _currentResponse->get_header("Content-Type", "none") == "none") {
            _currentResponse->set_header("Content-Type", RESTTraits<T>::contentTypeStr);
        }
    } else {
        _L.debug("Endpoint overrided response content.");
    }

    auto rPtr = _currentResponse;
    _currentResponse.reset();
    _currentRequstMsgPtr = nullptr;
    return rPtr;
}

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

