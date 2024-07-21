#include "sync-http-srv/error.hh"
#include "sync-http-srv/logging.hh"
#include "sync-http-srv/server.hh"
//#include "sync-http-srv/processes-resource.hh"

#include <cstring>
#include <unordered_map>
#include <unistd.h>
#include <cassert>

namespace sync_http_srv {
namespace util {
namespace http {

//                                                                _____________
// _____________________________________________________________/ HTTP Message

static std::unordered_map<std::string, Msg::Method> _mtdStr2Code;
static std::unordered_map<Msg::Method, std::string> _mtdCode2Str;

static std::unordered_map<std::string, Msg::Version> _verStr2Code;
static std::unordered_map<Msg::Version, std::string> _verCode2Str;

static std::unordered_map<std::string, Msg::StatusCode> _scStr2Code;
static std::unordered_map<Msg::StatusCode, std::string> _scCode2Str;
static std::unordered_map<Msg::StatusCode, std::string> _scCode2Vrb;

static void _fill_dicts() {
    if(!_mtdCode2Str.empty()) return;
    #define M_add_method(name)                                  \
    {                                                           \
        std::string nm = #name;                                 \
        _mtdCode2Str.emplace(Msg:: name, nm);               \
        std::transform(nm.begin(), nm.end(), nm.begin(),        \
                [](unsigned char c){ return std::tolower(c); });\
        _mtdStr2Code.emplace(nm, Msg:: name);               \
    }
    M_na64sw_for_every_http_method(M_add_method);
    #undef M_add_method

    #define M_add_version(name, code)                           \
    {                                                           \
        std::string nm = #name;                                 \
        std::transform(nm.begin(), nm.end(), nm.begin(),        \
                [](unsigned char c){ return std::tolower(c); });\
        _verStr2Code.emplace(nm, Msg:: name);               \
    }
    M_na64sw_for_every_http_version(M_add_version);
    #undef M_add_version
    _verStr2Code.emplace( "HTTP/0.9", Msg::HTTP_0_9 );
    _verStr2Code.emplace( "HTTP/1.0", Msg::HTTP_1_0 );
    _verStr2Code.emplace( "HTTP/1.1", Msg::HTTP_1_1 );
    _verStr2Code.emplace( "HTTP/2",   Msg::HTTP_2_0 );
    _verStr2Code.emplace( "HTTP/2.0", Msg::HTTP_2_0 );
    _verCode2Str.emplace( Msg::HTTP_0_9, "HTTP/0.9" );
    _verCode2Str.emplace( Msg::HTTP_1_0, "HTTP/1.1" );
    _verCode2Str.emplace( Msg::HTTP_1_1, "HTTP/1.1" );
    _verCode2Str.emplace( Msg::HTTP_2_0, "HTTP/2.0" );

    #define M_add_status_code(name, code, verb)                 \
    {                                                           \
        std::string nm = #name;                                 \
        _scCode2Str.emplace(Msg:: name, nm);                \
        _scCode2Vrb.emplace(Msg:: name, verb);              \
        std::transform(nm.begin(), nm.end(), nm.begin(),        \
                [](unsigned char c){ return std::tolower(c); });\
        _scStr2Code.emplace(nm, Msg:: name );               \
        std::string v = verb;                                   \
        std::transform(v.begin(), v.end(), v.begin(),           \
                [](unsigned char c){ return std::tolower(c); });\
        _scStr2Code.emplace(v, Msg:: name );                \
    }
    M_na64sw_for_every_http_status_code(M_add_status_code);
    #undef M_add_status_code
}


Msg::Method
Msg::method_from_str(const std::string & s_) {
    _fill_dicts();
    auto s = s_;
    std::transform(s.begin(), s.end(), s.begin(),
        [](unsigned char c){ return std::tolower(c); });
    auto it = _mtdStr2Code.find(s);
    if(_mtdStr2Code.end() == it) {
        char errBf[128];
        snprintf( errBf, sizeof(errBf)
                , "Method \"%s\" is not supported by server API."
                , s_.data());
        throw errors::HTTPUnsupportedMethod(errBf);
    }
    return it->second;
}

std::string
Msg::to_str(Method m) {
    _fill_dicts();
    auto it = _mtdCode2Str.find(m);
    assert(_mtdCode2Str.end() != it);
    return it->second;
}

Msg::Version
Msg::version_from_str(const std::string & s) {
    _fill_dicts();
    //auto s = s_;
    //std::transform(s.begin(), s.end(), s.begin(),
    //    [](unsigned char c){ return std::tolower(c); });
    auto it = _verStr2Code.find(s);
    if(_verStr2Code.end() == it) {
        char errBf[128];
        snprintf( errBf, sizeof(errBf)
                , "HTTP version \"%s\" is not supported by server API."
                , s.data());
        throw errors::HTTPUnsupportedVersion(errBf);
    }
    return it->second;    
}

std::string
Msg::to_str(Version v) {
    _fill_dicts();
    auto it = _verCode2Str.find(v);
    assert(_verCode2Str.end() != it);
    return it->second;
}


std::string
Msg::to_str(StatusCode sc) {
    _fill_dicts();
    auto it = _scCode2Vrb.find(sc);
    assert(_scCode2Str.end() != it);
    return it->second;
}

static const std::regex
    _rxHdrLine(R"~(^\s*([a-zA-Z0-9\-_]+)\s*:\s*([A-Za-z0-9_ :;.,\\/"'?!(){}\[\]@<>=\-+*#$&`|~^%]+)\s*$)~"),
    //                  ^^^^^^^^^^^^^^^         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //                  Key                     Value
    _rxRqLine(R"~(^\s*([A-Z]+)\s+([^\s]+)\s+(HTTP[^s]+\s*)$)~"),
    //                 ^^^^^^     ^^^^^^     ^^^^^^^^^
    //                 GET        /path/to   HTTP ver.
    _rxRpLine(R"~(^\s*(HTTP[^s]+)\s+(\d+)\s+(.+)\s*$)~")
    //                 ^^^^^^^^^^     ^^^    ^^
    //                 HTTP ver       NSC    Verbose name
    ;

void
Msg::_consider_header_line(const std::string & line) {
    std::smatch m;
    if(std::regex_match(line, m, _rxHdrLine )) {
        // This is header "key:value" line
        std::vector<std::string> groups(m.begin(), m.end());
        const std::string & key = groups[1]
                        , & value = groups[2]
                        ;
        set_header(key, value);
    } else if(std::regex_match(line, m, _rxRqLine)) {
        // This is 1st line in request
        std::vector<std::string> groups(m.begin(), m.end());
        _consider_request_header(groups);
    } else if(std::regex_match(line, m, _rxRpLine)) {
        // This is 1st line in response
        std::vector<std::string> groups(m.begin(), m.end());
        _consider_response_header(groups);
    } else {
        char errbf[256];
        snprintf(errbf, sizeof(errbf), "Header line does not match any"
                " of expected patterns: \"%s\"", line.c_str());
        throw errors::RequestError(errbf);
    }
}

void
Msg::_consider_request_header(const std::vector<std::string> &) {
    throw errors::GenericHTTPError("Call to request header 1st line's treatment for"
            " non-request message");
}

void
Msg::_consider_response_header(const std::vector<std::string> &) {
    throw errors::GenericHTTPError("Call to response header 1st line's treatment for"
            " non-response message");
}

void
Msg::clear_content() {
    _content.reset();
}

void
Msg::content(std::shared_ptr<iContent> p) {
    _content = p;
}

const std::shared_ptr<Msg::iContent>
Msg::content() const {
    return _content;
}

bool
Msg::has_content() const {
    return _content != nullptr;
}

void
Msg::set_header(std::string key, const std::string &value) {
    std::transform(key.begin(), key.end(), key.begin(),
        [](unsigned char c){ return std::tolower(c); });
    _headers[key] = value;
}

std::string
Msg::get_header(std::string key, const std::string & dftVal) const {
    std::transform(key.begin(), key.end(), key.begin(),
        [](unsigned char c){ return std::tolower(c); });
    auto it = _headers.find(key);
    if(_headers.end() == it) return dftVal;
    return it->second;
}

void
Msg::append_content_data( const char * data
                        , size_t n
                        , size_t maxInMemContentLen
                        ) {
    if(0 == n) return;
    if(!_content) {
        size_t len = std::stoul(get_header("Content-Length", "0"));
        if(0 == len) {
            throw errors::RequestError("Content is not expected for this"
                    " response");
        }
        if(len > maxInMemContentLen) {
            throw std::runtime_error("TODO: tmp-file request content");  // TODO
        } else {
            _content = std::make_shared<StringContent>();
        }
    }
    _content->append(data, n);
}

std::string
Msg::header() const {
    std::ostringstream oss;
    for (const auto & p : headers()) {
        oss << p.first << ": " << p.second << "\r\n";
    }
    oss << "\r\n";
    return oss.str();
}

void
Msg::receive( int clientFD
            , char * buffer, size_t bufLen
            , size_t maxInMemContentLen
            , iJournal & L
            ) {
    bool reading = true
       , headersReceived = false  // set to `true' once all the headers are recieved
       ;
    char * recvBf = buffer;
    size_t expectedLength = 0
         , receivedContentLength = 0
         , totalBytesSent = 0
         ;
    while(reading) {
        // recieve HTTP data from request
        ssize_t len = recv( clientFD
                          , recvBf
                          , bufLen - (recvBf - buffer)
                          , 0
                          );
        if(0 == len && 0 == totalBytesSent) {
            L.debug( "Client closed connection with no data sent." );
            throw errors::ClientClosedConnection();
        } else if(len < 0) {
            int en = errno;
            if( errno == EAGAIN || errno == EWOULDBLOCK) {  // retry
                L.debug( "client's socket recv() returned"
                         " with EAGAIN/EWOULDBLOCK" );
                continue;
            } else {  // other error
                L.warn(util::format("recv() error: %s", strerror(en)).c_str());
                throw errors::ClientSocketError(strerror(en));
            }
        }
        totalBytesSent += len;
        if(!headersReceived) {
            const char * lastBgn = buffer;
            if( L.debug_enabled() ) {
                std::ostringstream ossd;
                ossd << "Message in buffer: \"";
                if(buffer != recvBf) {
                    ossd << "[" << std::string(buffer, recvBf) << "]";
                }
                ossd << std::string(recvBf, recvBf + len) << "\"";
                L.debug(ossd.str().c_str());
            } // (dbg) httpServer.messageParsing
            for(const char * c = buffer; c != recvBf + len; ++c) {
                if(*c != '\n') continue;
                if(c == buffer) continue;
                // It may denote end of some header line OR end of header
                // lines. Depending on whether rewquest is using CRLF or just
                // LF, latter case can be recognized by difference from
                // `lastBgn': 
                //      "...blah\r\n\r\n"
                //                 ^   ^ => (2 == c - lastBgn && *(c-1) == '\r' )
                //      "...blah\n\n"
                //               ^ ^ => (1 == c - lastBgn)
                if( ((c-buffer > 2) && (*c == '\n' && *(c-1) == '\r' && *(c-2) == '\n' ))  // sic!
                 || ((c-buffer > 0) && (*c == '\n' && *(c-1) == '\n'))
                  ) {  // we're done with headers
                    lastBgn = c+1;
                    // ^^^ shal guarantee that `lastBgn' will point on the
                    //     pl beginning
                    L.debug("Request headers parsed.");
                    headersReceived = true;
                    break;
                }
                std::string hdrLine = std::string(lastBgn, c);
                lastBgn = c;

                //trim(hdrLine);
                hdrLine.erase(hdrLine.begin(), std::find_if(hdrLine.begin(), hdrLine.end(), [](unsigned char ch) {
                    return !std::isspace(ch);
                }));
                hdrLine.erase(std::find_if(hdrLine.rbegin(), hdrLine.rend(), [](unsigned char ch) {
                    return !std::isspace(ch);
                }).base(), hdrLine.end());

                if(hdrLine.empty()) continue;
                _consider_header_line(hdrLine);
                if( L.debug_enabled() ) {
                    L.debug(util::format("header line \"%s\" considered"
                                , hdrLine.c_str() ).c_str());
                }
            }
            if(lastBgn == buffer) {
                throw errors::RequestHeaderIsTooLong();
            }
            // Now `lastBgn' points on the end of last portion of data being
            // parsed:
            //  1. It may point on the remanant of header(s) -- we keep this
            //     data piece in the read buffer and continue receiving.
            //  2. It may point at the beginning of the content -- we shall
            //     start to fill request content.
            //  3. It may point to the very end of the message received
            ssize_t tailLength = len - (lastBgn - recvBf);
            assert(tailLength >= 0);
            if( tailLength > 0 ) {
                memmove( buffer, lastBgn, tailLength );
                recvBf = buffer + tailLength;
                len = tailLength;
            } else if( tailLength == 0 ) {
                recvBf = buffer;
                len = 0;
            }
            expectedLength = std::stoul(get_header("Content-Length", "0"));
            if(len == 0 && expectedLength) continue;
        }
        if(headersReceived) {
            // TODO: If `Transfer-Encoding' header is given and has other than
            // "identity" value,  then the transfer-length is defined by use of
            // the "chunked" transfer-coding (section 3.6), unless the message
            // is terminated by closing the connection.
            if(0 != len) {
                if( L.debug_enabled() ) {
                    std::ostringstream ossd;
                    ossd << "Appending to pl " << len << "b: ";
                    for(const char * c = buffer; c - buffer != len; ++c ) {
                        if(!std::isspace(*c)) {
                            ossd << "'" << *c << "'";
                        } else {
                            ossd << "' '";
                        }
                        ossd << " (" << (int) *c << "), ";
                    }
                    L.debug(ossd.str().c_str());
                }  // (dbg) httpServer.messageParsing
                append_content_data(buffer, len, maxInMemContentLen);
                receivedContentLength += len;
                recvBf = buffer;
            }
            // 0 bytes recvd
            if(expectedLength == receivedContentLength) {
                // got all the data
                return;
            } 
            //else {
            //    if(0 == len) {
            //        throw errors::RequestError("Insufficient request body length.");
            //    }
            //}
        }
    }  // while(reading)
    //_L << log4cpp::Priority::DEBUG << "Received from " << clientIPStr
    //    << ": \"\"\""
    //    << std::string(buffer.data(), nReceived)
    //    << "\"\"\"";
    throw std::logic_error("Prohibited loop exit of socket listening routine.");
}

void
Msg::dispatch( int clientFD
             , char * buffer
             , size_t bufSize
             , iJournal & L
             ) const {
    if(0 >= bufSize) throw std::runtime_error("Bad buffer length");
    if(!buffer) throw std::runtime_error("Null pointer provided for dispatch buffer");
    if(!clientFD) throw std::runtime_error("Null FD for destination socket");
    std::string hdrsStr = header();  // used to keep only response headers
    // Dispatch headers; we don't use dispatch buffer here as they're already
    // in memory
    bool sending = true;
    ssize_t sent;
    while(sending) {
        sent = send(clientFD, hdrsStr.c_str(), hdrsStr.size(), 0x0);
        if(sent == -1) {
            int en = errno;
            if( en == EAGAIN || en == EWOULDBLOCK ) continue;
            L.warn(util::format("Error dispatching response headers:"
                        " %s, giving up", strerror(en)).c_str());
            return;
        } else if( sent != (ssize_t) hdrsStr.size() ) {
            // this must be highly improbable error, according to the specs
            L.error("send() have sent less bytes that was ordered to; giving up.");
            return;
        }
        break;
    }
    if(!(has_content() && content()->size())) {
        L.debug("Sent response with empty body.");
        return;
    }
    sending = true;
    size_t sentContentBytes = 0;
    while(sending) {
        size_t toSend
            = content()->copy_to(buffer, bufSize, sentContentBytes);
        assert(0 != toSend);  // we're done
        sent = send( clientFD  // TODO: server can get SIGPIPE here
                   , buffer
                   , toSend
                   , 0x0
                   );
        if(sent == -1) {
            int en = errno;
            if( en == EAGAIN || en == EWOULDBLOCK ) continue;
            L.warn(util::format("Error dispatching response body: %s, giving"
                        " up.", strerror(en)).c_str());
            return;
        } else if(sent > 0) {
            sentContentBytes += sent;
        } else {
            throw std::logic_error("Unspecified return value send()");
        }
        assert(sentContentBytes <= content()->size());
        if(sentContentBytes == content()->size()) {
            //L << log4cpp::Priority::INFO
            //  << Msg::to_str(status_code()) << " (" << (int) status_code() 
            //  << "), body of "
            //  << sentContentBytes
            //  << " bytes.";
            return;
        }
    }
}

//                                                          ___________________
// _______________________________________________________/ Request / Response

void
RequestMsg::_consider_request_header(const std::vector<std::string> & groups) {
    const std::string & method_ = groups[1]
                    , & path = groups[2]
                    , & protocol = groups[3]
                    ;
    _method = method_from_str(method_);
    _strURI = path;
    _uri = URI(_strURI);
    _version = version_from_str(protocol);
}


std::string
RequestMsg::header() const {
    std::ostringstream oss;
    oss << Msg::to_str(method())  << " "
        << uri().path() << " "
        << Msg::to_str(version())
        << "\r\n";
    oss << Msg::header();
    return oss.str();
}

void
RequestMsg::uri(const URI & uri_) {
    _strURI = uri_.to_str();
    _uri = uri_;
}

void
RequestMsg::uri(const std::string & uri_) {
    _uri = URI(uri_);
    _strURI = uri_;
}

void
ResponseMsg::_consider_response_header(const std::vector<std::string> & groups) {
    const std::string & protocol = groups[1]
                    , & numErrCode = groups[2]
                    //, & verbErr = groups[3]
                    ;
    _version = version_from_str(protocol);
    _code = (StatusCode) std::stoi(numErrCode);  // todo: validate?
    // verbErr ?
}

std::string
ResponseMsg::header() const {
    std::ostringstream oss;
    oss << Msg::to_str(version()) << ' ';
    oss << static_cast<int>(status_code()) << ' ';
    oss << Msg::to_str(status_code()) << "\r\n";
    oss << Msg::header();
    return oss.str();
}

void
ResponseMsg::finalize() {
    if(has_content()) {
        char bf[64];
        snprintf(bf, sizeof(bf), "%zu", content()->size());
        set_header("content-length", bf);
    }
    //std::transform( hdrName.begin(), hdrName.end(), hdrName.begin()
    //              , [](){} );
    // ^^^ TODO: camelize keys
}

//                                                         ____________________
// ______________________________________________________/ String content type

size_t
StringContent::copy_to( char * dest
                      , size_t maxLen
                      , size_t from
                      ) const {
    if(from >= _content.size()) {
        throw errors::GenericSocketError(util::format("Can not copy up to %zu bytes from content"
                " of length %zu from %zu-th byte."
                , maxLen, _content.size(), from ).c_str());
    }
    size_t copied;
    copied = _content.size() - from > maxLen
           ? maxLen
           : _content.size() - from;
    memcpy(dest, _content.c_str() + from, copied);
    return copied;
}

//                                                                      _______
// ___________________________________________________________________/ Server

Server::Server( const std::string & host_
              , uint16_t portNo
              , iJournal & logCat
              , uint16_t backlog
              , uint32_t connectionTimeout
              , size_t ioBufSize
              , size_t maxInMemContentLen
              )
        : _host(host_)
        , _port(portNo)
        , _L(logCat)
        , _backlog(backlog)
        , _connectionTimeout(connectionTimeout)
        , _sockFD(-1)
        , _recvBuffer(nullptr)
        , _respBuffer(nullptr)
        , _ioBufSize(ioBufSize)
        , _maxInMemContentLen(maxInMemContentLen)
        , _keepGoing(true)
        {
    if((_sockFD = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
        int en_ = errno;
        throw errors::GenericSocketError(util::format("socket() error: %s"
                    , strerror(en_)).c_str());
    }

    int opt = 1;

    if(setsockopt(_sockFD, SOL_SOCKET, SO_REUSEADDR | SO_REUSEPORT, &opt, sizeof(opt)) < 0) {
        int en_ = errno;
        errors::GenericSocketError(util::format("setsockopt() error: %s"
                    , strerror(en_)).c_str());
    }

    _srvAddr.sin_family = AF_INET;
    _srvAddr.sin_addr.s_addr = INADDR_ANY;
    inet_pton(AF_INET, _host.c_str(), &(_srvAddr.sin_addr.s_addr));
    _srvAddr.sin_port = _port ? htons(_port) : 0;

    if(bind(_sockFD, (sockaddr *)&_srvAddr, sizeof(_srvAddr)) < 0) {
        int en_ = errno;
        errors::GenericSocketError(util::format("bind() error: %s"
                    , strerror(en_)).c_str());
    }

    if(listen(_sockFD, _backlog) < 0) {
        int en_ = errno;
        errors::GenericSocketError(util::format("listen() error: %s"
                    , strerror(en_)).c_str());
    }

    { // find out (new) listening port number
        socklen_t len = sizeof(_srvAddr);
        getsockname( _sockFD
                   , (sockaddr *) &_srvAddr
                   , &len
                   );
        _port = ntohs(_srvAddr.sin_port);
    }

    _recvBuffer = new char [_ioBufSize];
    _respBuffer = new char [_ioBufSize];

    _L.info(util::format("HTTP server \"%s:%d\" created."
           , _host.c_str(), (int) _port).c_str() );
}

Server::~Server() {
    if(_sockFD > -1) {
        close(_sockFD);
    }
    if(_recvBuffer) delete [] _recvBuffer;
    if(_respBuffer) delete [] _respBuffer;
}

std::shared_ptr<RequestMsg>
Server::_receive(int clientFD, const char * clientIPStr) {
    auto rq = std::make_shared<RequestMsg>();
    rq->receive(clientFD, _recvBuffer, _ioBufSize, _maxInMemContentLen, _L);
    return rq;
}

void
Server::_dispatch( int clientFD
                 , const char * clientIPStr
                 , std::shared_ptr<ResponseMsg> rp ) {
    rp->finalize();
    if(rp->has_content() && rp->get_header("content-type", "").empty()) {
        _L.warn("Response has no Content-Type header.");
    }
    rp->dispatch(clientFD, _respBuffer, _ioBufSize, _L);
}

void
Server::run( const Routes & routes ) {
    sockaddr_in clientAddr;
    socklen_t clientSize = sizeof(clientAddr);
    int clientFD;

    // accept new connections and distribute tasks to worker threads
    while( _keepGoing ) {
        clientFD = accept4( _sockFD
                          , (sockaddr *)&clientAddr
                          , &clientSize
                          , 0x0
                          );
        if( clientFD < 0 ) {
            int en = errno;
            _L.warn(util::format("accept4() error: %s", strerror(en)).c_str());
            continue;
        }
        
        // get client for logging
        struct in_addr ipAddr = clientAddr.sin_addr;
        char clientIPStr[INET_ADDRSTRLEN];
        inet_ntop( AF_INET, &ipAddr, clientIPStr, INET_ADDRSTRLEN );
        
        std::shared_ptr<RequestMsg> rqPtr;

        // try to parse request, return "Bad Request"/400 on parsing failure
        std::shared_ptr<ResponseMsg> respPtr = nullptr;
        bool hadError = false;
        try {
            rqPtr = _receive(clientFD, clientIPStr);
        } catch( errors::ClientClosedConnection & e ) {
            _L.info(util::format("Client closed connection, abort request handling for %s"
                        , clientIPStr).c_str());
            close(clientFD);
            continue;
        } catch( errors::ClientSocketError & e ) {
            _L.error(util::format("Client socket error: %s, abort request handling for %s"
                    , e.what(), clientIPStr).c_str());
            close(clientFD);
            continue;
        } catch( errors::RequestError & e ) {
            _L.error(util::format("Request error from %s: %s"
                    , clientIPStr, e.what()).c_str());
            // respond with error
            char errBf[256];
            snprintf( errBf, sizeof(errBf)
                    , "{\"errors\":[\"%s\"]}"
                    , e.what() );
            if(e.statusCode) {
                respPtr = std::make_shared<ResponseMsg>((Msg::StatusCode) e.statusCode);
            } else {
                respPtr = std::make_shared<ResponseMsg>(Msg::BadRequest);
            }
            respPtr->content(std::make_shared<StringContent>(errBf));
            respPtr->set_header("Content-Type", "application/json");
            hadError = true;
        } catch( std::exception & e ) {
            _L.error(util::format("Request error from %s: %s"
                    , clientIPStr, e.what()).c_str());
            // respond with error
            char errBf[512];
            snprintf( errBf, sizeof(errBf)
                    , "{\"errors\":[\"%s\"]}"
                    , e.what() );
            respPtr = std::make_shared<ResponseMsg>(Msg::InternalServerError);
            respPtr->content(std::make_shared<StringContent>(errBf));
            respPtr->set_header("Content-Type", "application/json");
            hadError = true;
        }
        if(rqPtr) {
            rqPtr->client_ip(clientIPStr);
        }
        uint16_t execFlags = 0x0;
        if(!hadError) {
            assert(rqPtr);
            // handle with first matching route
            iRoute::URLParameters urlParams;
            for( auto routeIt = routes.begin(); routes.end() != routeIt; ++routeIt ) {
                if( !routeIt->first->can_handle(rqPtr->uri().path(), urlParams) ) continue;
                try {
                    auto r = routeIt->second->handle(*rqPtr, clientFD, urlParams);
                    respPtr = r.second;
                    execFlags = r.first;
                } catch( std::exception & e ) {
                    _L.error(util::format("Error on route \"%s\" while"
                        " handling request from %s: \"%s\""
                        , routeIt->first->name.c_str()
                        , clientIPStr
                        , e.what() ).c_str());
                    // respond with error
                    char errBf[256];
                    snprintf( errBf, sizeof(errBf)
                            , "{\"errors\":[\"%s\"]}"
                            , e.what() );
                    assert(!respPtr);
                    respPtr = std::make_shared<ResponseMsg>(Msg::BadRequest);
                    respPtr->content(std::make_shared<StringContent>(errBf));
                    respPtr->set_header("Content-Type", "application/json");
                    hadError = true;
                }
                if( hadError ) execFlags = 0x0;
                if( respPtr ) break;  // request handled
                _L.warn(util::format("Route \"%s\" promised to handle path %s"
                        " from %s but did not return"
                        " response object."
                        , routeIt->first->name.c_str()
                        , rqPtr->uri().path().c_str()
                        , clientIPStr
                        ).c_str());
            }
        }
        // TODO: check for server-wide OPTIONS request (may be addressed
        //       to '*'), need to return methods, content type, etc
        if(!respPtr) {
            _L.warn(util::format("No matching route for request from %s with URI %s"
                , clientIPStr
                , (rqPtr ? rqPtr->str_uri().c_str() : "(null rq.)") ).c_str());
            // no matching routes
            assert(!hadError);
            // respond with error
            respPtr = std::make_shared<ResponseMsg>(Msg::NotFound);
            respPtr->content(std::make_shared<StringContent>(
                        "{\"errors\":[\"Invalid path, no matching route.\"]}"));
            respPtr->set_header("Content-Type", "application/json");
            hadError = true;
        }
        assert(respPtr);
        if(!(execFlags & kNoDispatchResponse)) {
            respPtr->set_header("Access-Control-Allow-Origin", "*");  // TODO: configurable
            _dispatch(clientFD, clientIPStr, respPtr);
        }
        if(!(execFlags & kKeepClientConnection))
            close(clientFD);
        if( execFlags & kStop )
            break;
    }  // server's "keepGoing"
    _L.info("Server shutdown.");
}

//
// Regex-based route implementation

RegexRoute::RegexRoute( const std::string & routeName
                      , const std::string & inPattern
                      , const std::unordered_map<size_t, std::string> & groups
                      , const std::string & outPattern
                      ) : iRoute(routeName)
                        , _pattern(inPattern)
                        , _rx(_pattern)
                        , _groups(groups)
                        , _pathStrPattern(outPattern)
                        {}

bool
RegexRoute::can_handle(const std::string & path, URLParameters & urlParams) const {
    std::smatch m;
    if( !std::regex_match(path, m, _rx ) ) return false;
    urlParams.clear();
    std::vector<std::string> groups(m.begin(), m.end());
    for(const auto & item : _groups) {
        if(item.first > groups.size()) {
            throw errors::GenericHTTPError(util::format(
                    "Route pattern \"%s\" on path \"%s\""
                    " yielded only %zu groups, but named groups dictionary"
                    " expects at least %zu-th entry (\"%s\")"
                    , _pattern.c_str(), path.c_str(), groups.size()
                    , item.first, item.second.c_str() ).c_str());
        }
        urlParams[item.second] = groups.at(item.first);
    }
    return true;
}

std::string
RegexRoute::path_for(const URLParameters & params) const {
    std::string r(_pathStrPattern);
    // Iterate over all entries within a context (we assume context to be
    // short).
    for( auto entry : params ) {
        std::size_t pos;
        const std::string key = "{" + entry.first + "}"
                        , & val = entry.second;
        // Unil there is no more occurances of the string, perform search and
        // substitution
        while( std::string::npos != (pos = r.find(key)) ) {
            r = r.replace( pos, key.length(), val );
        }
    }
    if(std::string::npos != r.find_first_of("{}")) {
        throw errors::GenericRuntimeError(util::format("Failed to resolve all path"
                " parameters for path pattern \"%s\"; resulting string \""
                "%s\" still has markup symbols.", _pathStrPattern.c_str()
                , r.c_str() ).c_str());
    }
    return r;
}

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

