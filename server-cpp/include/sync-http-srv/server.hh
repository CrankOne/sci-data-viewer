#pragma once

/**\file
 * \brief Extremely simple implementation of single-threaded HTTP server
 *
 * Purpose of this server implementation is to facilitate REST-like API for
 * computational applications and serve static files for single-page
 * applications. It works in synchroneous mode, so request/response cycle can
 * take significant amount of time.
 *
 * This rudimentary server implementation operates in blocking mode (so no
 * parallel executors, event polling, queues, etc) typically found for
 * full-fledged servers designed to handle multiple connections.
 *
 * The document provides some constrains for HTTP protocol and simplistic
 * server implementation as well.
 *
 * Based on following code: https://github.com/trungams/http-server/
 * */

//#include "na64util/uri.hh"

#include <sys/socket.h>
#include <arpa/inet.h>

#include <list>
#include <regex>
#include <unordered_map>

#include "sync-http-srv/error.hh"
#include "sync-http-srv/logging.hh"
#include "sync-http-srv/uri.hh"

namespace sync_http_srv {
namespace errors {

///\brief Error related to socket layer
class GenericSocketError : public GenericRuntimeError {
public:
    GenericSocketError( const char * s ) throw() : GenericRuntimeError( s ) {}
};


///\brief Base class to all errors anticipated for errors related to HTTP
///
/// Should not correspond to any status code; use 500 (Server Error) as the
/// last resort.
class GenericHTTPError : public GenericRuntimeError {
public:
    const int statusCode;
    GenericHTTPError( const char * s
                    , int statusCode_=500 ) throw() : GenericRuntimeError( s )
                                                    , statusCode(statusCode_) {}
};

///\brief Low-level protocol error, client abrupt connection
///
/// Not communicated to the client (no HTTP status code to return)
class ClientClosedConnection : public GenericHTTPError {
public:
    ClientClosedConnection() throw()
        : GenericHTTPError("Client closed connection", 500) {}
};

///\brief Low-level protocol error, unforseen socket state or failure
///
/// Not communicated to the client (no HTTP status code to return)
class ClientSocketError : public GenericHTTPError {
public:
    ClientSocketError(const char * s) throw()
        : GenericHTTPError(s, 500) {}
};

///\brief Base class of request format error
///
/// Corresponds to 400 (Bad Request) HTTP status code
class RequestError : public GenericHTTPError {
public:
    RequestError(const char * s, int sc=400) throw()
        : GenericHTTPError(s, sc) {}
};

///\brief Base class of request format error
///
/// Corresponds to 431 (Request Header Fields Too Large) HTTP status code,
/// (RFC 6585).
class RequestHeaderIsTooLong : public RequestError {
public:
    RequestHeaderIsTooLong() throw()
        : RequestError("Request header is too long.", 431) {}
};

/**\brief Request method is not supported
 *
 * Throws by routes when requested method is not anticipated by implementation.
 * Corresponds to 405 (Method Not Allowed) status code.
 * */
class HTTPUnsupportedMethod : public RequestError {
public:
    HTTPUnsupportedMethod( const char * s ) throw() : RequestError( s, 405 ) {}
};

/**\brief HTTP version is not supported
 *
 * Throws by routes when requested HTTP version is not anticipated by
 * implementation. Corresponds to 505 (HTTP Version Not Supported) status code.
 * */
class HTTPUnsupportedVersion : public GenericHTTPError {
public:
    HTTPUnsupportedVersion( const char * s ) throw() : GenericHTTPError( s, 505 ) {}
};

/**\brief Thrown on parsing status code(s)
 *
 * Rather an internal server error, thrown in unknown status code appears in
 * routines.
 * */
class HTTPUnknownStatusCode : public GenericHTTPError {
public:
    HTTPUnknownStatusCode( const char * s ) throw() : GenericHTTPError( s ) {}
};

}  // namespace ::na64dp::errors

namespace util {
namespace http {

#define M_na64sw_for_every_http_method(M) \
    M(GET)      \
    M(HEAD)     \
    M(POST)     \
    M(PUT)      \
    M(DELETE)   \
    M(CONNECT)  \
    M(OPTIONS)  \
    M(TRACE)    \
    M(PATCH)    \
    /* ... */

#define M_na64sw_for_every_http_version(M) \
    M(HTTP_0_9,  9) \
    M(HTTP_1_0, 10) \
    M(HTTP_1_1, 11) \
    M(HTTP_2_0, 20) \
    /* ... */

#define M_na64sw_for_every_http_status_code(M)                                \
    M( Continue,                    100, "Continue"                         ) \
    M( SwitchingProtocols,          101, "Switching Protocols"              ) \
    M( EarlyHints,                  103, "Early Hints"                      ) \
    M( Ok,                          200, "OK"                               ) \
    M( Created,                     201, "Created"                          ) \
    M( Accepted,                    202, "Accepted"                         ) \
    M( NonAuthoritativeInformation, 203, "Non-Authoritative Information"    ) \
    M( NoContent,                   204, "No Content"                       ) \
    M( ResetContent,                205, "Reset Content"                    ) \
    M( PartialContent,              206, "Partial Content"                  ) \
    M( MultipleChoices,             300, "Multiple Choices"                 ) \
    M( MovedPermanently,            301, "Moved Permanently"                ) \
    M( Found,                       302, "Found"                            ) \
    M( NotModified,                 304, "Not Modified"                     ) \
    M( PermanentRedirect,           308, "Permanent Redirect"               ) \
    M( BadRequest,                  400, "Bad Request"                      ) \
    M( Unauthorized,                401, "Unauthorized"                     ) \
    M( Forbidden,                   403, "Forbidden"                        ) \
    M( NotFound,                    404, "Not Found"                        ) \
    M( MethodNotAllowed,            405, "Method Not Allowed"               ) \
    M( RequestTimeout,              408, "Request Timeout"                  ) \
    M( Gone,                        410, "Gone"                             ) \
    M( ImATeapot,                   418, "I'm a teapot"                     ) \
    M( InternalServerError,         500, "Internal Server Error"            ) \
    M( NotImplemented,              501, "Not Implemented"                  ) \
    M( BadGateway,                  502, "Bad Gateway"                      ) \
    M( ServiceUnvailable,           503, "Service Unvailable"               ) \
    M( GatewayTimeout,              504, "Gateway Timeout"                  ) \
    M( HttpVersionNotSupported,     505, "HTTP Version Not Supported"       ) \
    /* ... */

/**\brief Aux container for HTTP message
 *
 * No particular payload is implied for message's content. Subset of supported
 * methods, versions, etc. is restricted to somewhat common usage.
 * */
class Msg {
public:
    /**\brief Abstraction for payload data
     *
     * This shim foresees iterative receiving/dispatch of large files to avoid
     * in-memory storage.
     * */
    struct iContent {
        virtual size_t size() const = 0;
        virtual void append(const char * data, size_t n) = 0;
        virtual size_t copy_to(char * dest, size_t maxLen, size_t from=0) const = 0;
    };
public:
    enum Method {
        #define M_declare_method(nm) nm,
        M_na64sw_for_every_http_method(M_declare_method)
        #undef M_declare_method
    };
    static Method method_from_str(const std::string &);
    static std::string to_str(Method);

    enum Version {
        #define M_declare_version(nm, code) nm = code,
        M_na64sw_for_every_http_version(M_declare_version)
        #undef M_declare_version
    };
    static Version version_from_str(const std::string &);
    static std::string to_str(Version);

    enum StatusCode {
        #define M_declare_status_code(nm, code, verb) nm = code,
        M_na64sw_for_every_http_status_code(M_declare_status_code)
        #undef M_declare_status_code
    };
    static std::string to_str(StatusCode);
protected:
    Version _version;
    std::map<std::string, std::string> _headers;
    std::shared_ptr<iContent> _content;

    ///\brief For request message -- sets URL, method, and version
    ///
    /// This is a stub handling 1st line of request message. Default
    /// impleemntation emits an error.
    virtual void _consider_request_header(const std::vector<std::string> &);
    ///\brief For response message -- sets status code and version
    ///
    /// This is a stub handling 1st line of response message. Default
    /// impleemntation emits an error.
    virtual void _consider_response_header(const std::vector<std::string> &);
    ///\brief Sets HTTP message's header
    ///
    /// Besides of header treatment, may forward to `_consider_header_line()`
    /// internally (so treats also 1st line of requests).
    void _consider_header_line(const std::string &);
public:
    Msg(Version ver=HTTP_1_1)
            : _version(ver)
            , _content(nullptr)
            {}
    virtual ~Msg() {}

    // header routines
    const std::map<std::string, std::string> & headers() const { return _headers; }
    void set_header(std::string key, const std::string& value);
    std::string get_header(std::string key, const std::string & dftVal="") const;

    // content routines
    /// Clears associated content
    virtual void clear_content();
    /// Sets plain string content
    virtual void content(std::shared_ptr<iContent> p);
    ///\brief Returns plain string content
    ///
    ///\note: Raises server error if message keeps file content
    virtual const std::shared_ptr<iContent> content() const;
    /// Returns whether or not a content is associated to message
    virtual bool has_content() const;

    // version
    /// HTTP version
    Version version() const { return _version; }

    /// Returns header string (with trailing blank line)
    virtual std::string header() const;

    /// Appends content instance with given data block
    ///
    /// Does not check content type.
    void append_content_data(const char * data, size_t, size_t);

    /// Dispatch message by socket FD using given buffer
    void dispatch( int clientFD
                 , char * buffer, size_t bufSize
                 , iJournal &
                 ) const;

    /// Receive message by socket FD using given buffer
    void receive( int clientFD
                , char * buffer, size_t bufLen
                , size_t maxInMemContentLen
                , iJournal &
                );
};  // class Msg


///\brief Simple in-memory (string) content
class StringContent : public Msg::iContent {
protected:
    std::string _content;
public:
    StringContent() {}
    StringContent(const std::string & s) : _content(s) {}

    virtual void append(const char * data, size_t n) override
        { _content += std::string(data, n); }
    virtual size_t size() const override
        { return _content.size(); }
    virtual size_t copy_to(char * dest, size_t maxLen, size_t from=0) const override;
};

/**\brief Subtype of HTTP message bearing data specific for request
 *
 * Additional data:
 *  - request method (POST, GET, etc)
 *  - request URI
 * */
class RequestMsg : public Msg {
protected:
    Method _method;
    std::string _strURI;
    URI _uri;
    std::string _clientIP;

    void _consider_request_header(const std::vector<std::string> &) override;
public:
    /// Ctr
    RequestMsg() : _method(GET) {}
    /// Parses header line
    void consider_line(const std::string &);

    /// Client IP setter
    void client_ip(const std::string & ips) { _clientIP = ips; }

    std::string header() const override;

    Method method() const { return _method; }
    const std::string & str_uri() const { return _strURI; }
    const URI & uri() const { return _uri; }
    const std::string & ip_str() const { return _clientIP; }
    void uri(const URI & uri_);
    void uri(const std::string & uri_);
};

/**\brief Subtype of HTTP message bearing data specific for response messages
 *
 * Additional data:
 *  - response status code
 *  - special field to refer to static files to be sent
 *
 * \todo Foresee file descriptor for large static files dispatch
 * */
class ResponseMsg : public Msg {
protected:
    StatusCode _code;

    void _consider_response_header(const std::vector<std::string> &) override;
public:
    ResponseMsg(StatusCode c=Msg::Ok) : _code(c) {}
    StatusCode status_code() const { return _code; }
    void status_code(Msg::StatusCode c) { _code = c; }

    std::string header() const override;

    ///\brief Finalizes response object before dispatch
    void finalize();
};

/**\brief Simpistic HTTP server implementation
 *
 * Operates by receiving HTTP requests and forwarding pre-parsed messages
 * to first matching "route" instance in synchroneous mode. Given list of
 * routes is checked agsinst request synchroneously (so no check on URL rule
 * collisions).
 *
 * Note that route handling may control server execution. It is used to fork
 * computation processes on various stages of configuration. Depending on
 * flags given in first item of returned pair, caller code is adviced to
 * either:
 *  - Stop serving current routes configuration, fork the process and advance
 *    execution to whatever stage is anticipated next for the
 *    caller (`kAdvanceExecution | kStopServer`)
 *  - ...
 *  - Terminate spawned processes and stop execution (kStopServer)
 * */
class Server {
public:
    static constexpr uint16_t kNoDispatchResponse = 0x1;
    static constexpr uint16_t kStop = 0x2;
    static constexpr uint16_t kKeepClientConnection = 0x4;

    /// Result type of route handling
    typedef std::pair< uint16_t, std::shared_ptr<ResponseMsg> > HandleResult;
    /// Route definition
    struct iRoute {
        const std::string name;

        iRoute(const std::string & name_) : name(name_) {}
        /// Route parameters extracted from path
        typedef std::unordered_map<std::string, std::string> URLParameters;
        /// Shall return `false` if path does not match the route.
        ///
        /// Extracted URL parameters must be returned with 2nd argument
        virtual bool can_handle(const std::string & path, URLParameters &) const = 0;
        /// Returns path string for given URL parameters
        virtual std::string path_for(const URLParameters &) const = 0;
    };
    /// Abstract route's endpoint
    struct iEndpoint {
        ///\brief Should check the request for match and return response
        ///
        /// Returned nullptr is considered as non-matching result
        virtual HandleResult handle( const RequestMsg &, int clientFD, const iRoute::URLParameters & ) = 0;
        virtual ~iEndpoint() {}
    };
    /// Routes list to serve
    typedef std::list< std::pair<iRoute *, iEndpoint *> > Routes;
private:
    /// Host name, used for server socket bind
    const std::string _host;
    /// Port number, used for server socket bind
    uint16_t _port;
    /// Destination logging category
    iJournal & _L;
    /// Number of simultaneous connections on socket (see `man listen()`)
    uint16_t _backlog;
    /// Connections timeout, sec
    const uint32_t _connectionTimeout;

    /// Server socket descriptor
    int _sockFD;
    /// Server socket address struct
    sockaddr_in _srvAddr;
    /// IO buffers for data receiving and dispatch
    char * _recvBuffer
       , * _respBuffer;
    const size_t _ioBufSize;

    const size_t _maxInMemContentLen;

    /// Flag used to decide whether server has to accept new request
    bool _keepGoing;
protected:
    std::shared_ptr<RequestMsg> _receive(int clientFD, const char * clientIPStr);
    void _dispatch(int clientFD, const char * clientIPStr, std::shared_ptr<ResponseMsg> );
public:
    /// Initializes the socket structures, allocates buffers
    Server( const std::string & host_
          , uint16_t portNo
          , iJournal & logCat
          , uint16_t backlog
          , uint32_t connectionTimeout
          , size_t ioBufSize
          , size_t maxInMemContentLen
          );
    const std::string & host() const { return _host; }
    uint16_t port() const { return _port; }
    /// Clean-ups listening structs
    ~Server();
    /// Runs the server, forarding connection to corresponding route
    void run( const Routes & routes );
    /// Can be called by one of the request handlers (routes) to stop the server
    void set_stop_flag() { _keepGoing = false; }
};  // class Server

/// Static string route implementation
class StringRoute : public Server::iRoute {
private:
    /// Path string for exact match.
    std::string _path;
public:
    /// Parameterised with route name and path string for exact matching
    StringRoute( const std::string & routeName
               , const std::string & path
               ) : Server::iRoute(routeName)
                 , _path(path)
                 {}
    /// Tests path versus pattern, extracts params if need
    bool can_handle(const std::string & path, URLParameters &) const override
        { return path == _path; }
    /// Generates path based on URL parameters using `_pathStrPattern`
    std::string path_for(const URLParameters &) const override
        { return _path; }
};

/// Regex-based route implementation
class RegexRoute : public Server::iRoute {
private:
    /// String pattern of regular expression (`std::regex` does not keep it)
    std::string _pattern;
    /// Compiled pattern
    std::regex _rx;
    /// Named groups from pattern
    std::unordered_map<size_t, std::string> _groups;
    /// Reverse pattern for url rendering, `util::str_fmt()`-compatible
    std::string _pathStrPattern;
public:
    /**\brief Ctr for named regex-based route
     *
     * Provided `inPattern` assumed to be a valid regular expression string
     * (aware of all escaped chars, etc). Its capture groups then considered
     * with `groups` argument filling `iRoute::URLParameters` instance at
     * `can_handle()` method. `outPattern` will be used by `str_subst()` to
     * generate the path string based on `URLParameters`.
     * */
    RegexRoute( const std::string & routeName
              , const std::string & inPattern
              , const std::unordered_map<size_t, std::string> & groups
              , const std::string & outPattern
              );
    /// Tests path versus pattern, extracts params if need
    bool can_handle(const std::string & path, URLParameters &) const override;
    /// Generates path based on URL parameters using `_pathStrPattern`
    std::string path_for(const URLParameters &) const override;

    const std::string & in_pattern() const { return _pattern; }
    const std::string & path_template() const { return _pathStrPattern; }
    const decltype(_groups) & match_groups() const { return _groups; }
    const std::regex & regex() const { return _rx; }
};

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

