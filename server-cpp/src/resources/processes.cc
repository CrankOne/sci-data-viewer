#include "sync-http-srv/processes-resource.hh"
#include "sync-http-srv/error.hh"
#include "sync-http-srv/logging.hh"

#include <unistd.h>
#include <sys/wait.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <netdb.h>

#include <thread>
#include <cerrno>
#include <cstring>

namespace sync_http_srv {
namespace util {
namespace http {

//
// Processes

void
Processes::_bind_forwarding_endpoint(ProcForawrdingEndpoint * ep) {
    if(_fwdEndpoint) {
        throw errors::RepeatativeBinding();
    }
    _fwdEndpoint = ep;
}

std::string
Processes::_vacant_proc_name(const std::string & nm) const {
    std::string name = nm;
    size_t n = 1;
    while(_children.end() != _children.find(nm) && n != std::numeric_limits<size_t>::max()) {
        name = util::format("%s-%zu", nm.c_str(), n++);
    }
    if(n == std::numeric_limits<size_t>::max()) {
        throw errors::MaxProcessNumberExceed();
    }
    return name;
}

void
Processes::_refresh_child_status( const std::string & subPName
                                ) {
    auto it = _children.find(subPName);
    auto & procInfo = it->second;
    if( _children.end() == it ) {
        throw errors::NoSuchChildProcess(subPName.c_str());
    }
    int procStatus = 0;
    int rc = waitpid(procInfo.pid, &procStatus, WNOHANG);
    if(-1 == rc) {
        int en = errno;
        _L.error(util::format("While updating children status with"
                    " waitpid(%d=\"%s\") an error occured: %s"
                    , (int) procInfo.pid 
                    , subPName.c_str()
                    , strerror(en)
                    ).c_str()
                );
        //log4cpp::Category::getInstance("httpServer")
        //    << log4cpp::Priority::ERROR
        //    << "While updating children status with waitpid("
        //    << (int) procInfo.pid
        //    << "=\"" << subPName
        //    << "\") an error occured : " << strerror(en)
        //    ;
        return;
    } else if( rc == procInfo.pid ) {
        if(WIFEXITED(procStatus)) {
            procInfo.isRunning = false;
            procInfo.exitCode = WEXITSTATUS(procStatus);
            _L.info(util::format(
                        "Child process %d discovered to be exited with status "
                        " %d.", procInfo.pid, procInfo.exitCode
                        ).c_str());
            //log4cpp::Category::getInstance("processes")
            //    << log4cpp::Priority::INFO
            //    << "Child process " << procInfo.pid << " discovered to be exited"
            //       " with status " << procInfo.exitCode << "."
            //    ;
        } else if(WIFSIGNALED(procStatus)) {
            procInfo.isRunning = false;
            procInfo.stopSignal = WSTOPSIG(procStatus);
            _L.info(util::format(
                        "Child process %d discovered to be stopped"
                        " with signal %d.", procInfo.pid, procInfo.stopSignal
                    ).c_str());
            //log4cpp::Category::getInstance("processes")
            //    << log4cpp::Priority::INFO
            //    << "Child process " << procInfo.pid << " discovered to be stopped"
            //       " with signal " << procInfo.stopSignal << "."
            //    ;
        } else {
            // this should be possible ONLY if WUNTRACED was used
            // in waitpid()
            _L.error(util::format("Can not interpret status from waitpid(%d)"
                        ") -- process seems to be terminated."
                        , (int) procInfo.pid
                        ).c_str());
            //log4cpp::Category::getInstance("httpServer")
            //    << log4cpp::Priority::ERROR
            //    << "Can not interpret status from waitpid("
            //    << (int) procInfo.pid << ") -- process seems stopped."
            //    ;
        }
    } else if( 0 == rc ) {
        // process running, no changes
        procInfo.isRunning = true;
    } else {
        _L.error(util::format("waitpid(%d) unexpected return code: %d"
                    , (int) procInfo.pid, rc ).c_str());
        //log4cpp::Category::getInstance("httpServer")
        //        << log4cpp::Priority::ERROR
        //        << "waitpid("
        //        << (int) procInfo.pid << ") unexpected return code "
        //        << rc;
        //        ;
    }
}

void
Processes::refresh_children_status() {
    for( auto it = _children.begin(); it != _children.end(); ++it ) {
        if(!it->second.isRunning) continue;
        _refresh_child_status(it->first);
    }
}

Processes::ChildProcess
Processes::fork_server( const std::string & name
                      , const std::string & subProcHost, uint16_t & childPort
                      , const std::string & procAPIPrefix
                      ) {
    _newSrv = _subSrvCtr(subProcHost, childPort);
    // update port value (will be used by caller)
    childPort = _newSrv->port();
    // assure all listener threads are done before fork to avoid possible side
    // effects with duplicated descriptors
    if(_fwdEndpoint)
        _fwdEndpoint->join_all_forwarding_connections();
    ChildProcess cpStruct = { -1  // pid
                            , childPort  // port
                            , true  // is running?
                            , 0  // exit code
                            , 0  // signal that term-d proc
                            , subProcHost
                            , procAPIPrefix
                            };
    // fork process
    cpStruct.pid = fork();
    if( -1 == cpStruct.pid ) {
        int en = errno;
        throw errors::ForkFailed(strerror(en));
    } 
    if( cpStruct.pid ) {  // in parent process
        delete _newSrv;  // closes new server's sockets at this process
        _newSrv = nullptr;
        _children.emplace(name, cpStruct);
        return cpStruct;
    }
    // in child process:
    return cpStruct;
}

//
// Process forwarding endpoint

// Used in thread call to forward connection to a subprocess, retrieve and
// forward back the response. The client socket is closed after the
// transaction and request point gets `delete`'d (so both arguments are owned
// by the this thread).
//
// TODO: timeouts
static void
_run_forward_request( RequestMsg * rq
                    , int clientFD
                    , uint16_t subPort
                    , std::string host
                    , iJournal & L
                    , size_t fwIOBufLen
                    , size_t maxInMemContentLen
                    ) {
    assert(fwIOBufLen);
    char * buf = new char[fwIOBufLen];
    int destSockFD;
    // connect with the sub-process server by port
    struct sockaddr_in destSockAddr;
    struct hostent * hostnm;    // server host name information
    if(host.empty()) host = "localhost";
    hostnm = gethostbyname(host.c_str());
    if( hostnm == (struct hostent *) 0) {
        ResponseMsg resp(Msg::InternalServerError);
        YAML::Node node;
        node["errors"] = YAML::Node(YAML::NodeType::Sequence);
        node["errors"][0] = util::format(
                "Could not resolve child process' host \"%s\" with"
                " gethostbyname() to forward to %s"
                , rq->uri().to_str().c_str(), host.c_str());
        RESTTraits<YAML::Node>::set_content(resp, node, L);
        try {
            resp.dispatch( clientFD
                         , buf, fwIOBufLen
                         , L );
        } catch( std::exception & e ) {
            L.error(util::format("While forwarding %s -- failed to dispatch error message"
                    " to client: %s"
                    , rq->uri().to_str().c_str()
                    , e.what()
                    ).c_str());
            //L << log4cpp::Priority::ERROR
            //  << "While forwarding "
            //  << rq->uri().to_str()
            //  << " -- failed to dispatch error message to client: "
            //  << e.what();
        }
        delete [] buf;
        close(clientFD);
        return;
    }

    destSockAddr.sin_family      = AF_INET;
    destSockAddr.sin_port        = htons(subPort);
    destSockAddr.sin_addr.s_addr = *((unsigned long *)hostnm->h_addr);

    if((destSockFD = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
        int en = errno;
        ResponseMsg resp(Msg::InternalServerError);
        YAML::Node node;
        node["errors"] = YAML::Node(YAML::NodeType::Sequence);
        node["errors"][0] = util::format(
                "Interim socket() failure: \"%s\", while forwarding to %s"
                , strerror(en)
                , rq->uri().to_str().c_str()
                );
        L.error(node["errors"][0].as<std::string>().c_str());
        //L << log4cpp::Priority::ERROR
        //  << node["errors"][0].as<std::string>().c_str();
        RESTTraits<YAML::Node>::set_content(resp, node, L);
        try {
            resp.dispatch( clientFD
                         , buf, fwIOBufLen
                         , L );
                } catch( std::exception & e ) {
            L.error(util::format("While forwarding to %s  -- failed to dispatch error"
                    " message to client: %s"
                    , rq->uri().to_str().c_str()
                    , e.what()
                    ).c_str());
            //L << log4cpp::Priority::ERROR
            //  << "While forwarding to "
            //  << rq->uri().to_str()
            //  << " -- failed to dispatch error message to client: "
            //  << e.what();
        }
        delete [] buf;
        close(clientFD);
        return;
    }

    if( connect( destSockFD
               , (struct sockaddr *) &destSockAddr, sizeof(destSockAddr)
               ) < 0 ) {
        int en = errno;
        ResponseMsg resp(Msg::InternalServerError);
        YAML::Node node;
        node["errors"] = YAML::Node(YAML::NodeType::Sequence);
        node["errors"][0] = util::format(
                "Interim connect() failure: \"%s\", while forwarding to %s"
                , strerror(en)
                , rq->uri().to_str().c_str()
                );
        L.error(node["errors"][0].as<std::string>().c_str());
        //L << log4cpp::Priority::ERROR
        //  << node["errors"][0].as<std::string>().c_str();
        RESTTraits<YAML::Node>::set_content(resp, node, L);
        try {
            resp.dispatch( clientFD
                         , buf, fwIOBufLen
                         , L );
        } catch( std::exception & e ) {
            L.error(util::format("While forwarding to %s  -- failed to dispatch error"
                    " message to client: %s"
                    , rq->uri().to_str().c_str()
                    , e.what()
                    ).c_str());
            //L << log4cpp::Priority::ERROR
            //  << "While forwarding to "
            //  << rq->uri().to_str()
            //  << " -- failed to dispatch error message to client: "
            //  << e.what();
        }
        delete [] buf;
        close(clientFD);
        close(destSockFD);
        return;
    }

    // communicate request
    try {
        rq->dispatch( destSockFD
                    , buf, fwIOBufLen
                    , L
                    );
    } catch( std::exception & e ) {
        ResponseMsg resp(Msg::InternalServerError);
        YAML::Node node;
        node["errors"] = YAML::Node(YAML::NodeType::Sequence);
        node["errors"][0] = util::format(
                "While forwarding to %s -- failed to forward request: %s"
                , e.what() );
        L.error(node["errors"][0].as<std::string>().c_str());
        //L << log4cpp::Priority::ERROR
        //  << node["errors"][0].as<std::string>().c_str();
        RESTTraits<YAML::Node>::set_content(resp, node, L);
        try {
            resp.dispatch( clientFD
                         , buf, fwIOBufLen
                         , L );
        } catch( std::exception & e ) {
            L.error(util::format("While forwarding to %s -- failed to dispatch error"
                    " message to client: %s"
                    , rq->uri().to_str().c_str()
                    , e.what()
                    ).c_str());
            //L << log4cpp::Priority::ERROR
            //  << "While forwarding to "
            //  << rq->uri().to_str()
            //  << " -- failed to dispatch error message to client: "
            //  << e.what();
        }
        delete [] buf;
        close(clientFD);
        close(destSockFD);
        return;
    }
    ResponseMsg resp(Msg::Ok);
    try {
        resp.receive( destSockFD
                    , buf, fwIOBufLen
                    , maxInMemContentLen
                    , L );
    } catch( std::exception & e ) {
        ResponseMsg resp(Msg::InternalServerError);
        YAML::Node node;
        node["errors"] = YAML::Node(YAML::NodeType::Sequence);
        node["errors"][0] = util::format(
                "While forwarding from %s -- failed to receive or interpret"
                " response message: %s"
                , rq->uri().to_str().c_str(), e.what() );
        L.error(node["errors"][0].as<std::string>().c_str());
        //L << log4cpp::Priority::ERROR
        //  << node["errors"][0].as<std::string>().c_str();
        RESTTraits<YAML::Node>::set_content(resp, node, L);
        try {
            resp.dispatch( clientFD
                         , buf, fwIOBufLen
                         , L );
        } catch( std::exception & e ) {
            L.error(util::format("While back-forwarding from %s  -- failed"
                    " to dispatch error message to client: %s"
                    , rq->uri().to_str().c_str()
                    , e.what()
                    ).c_str());
            //L << log4cpp::Priority::ERROR
            //  << "While back-forwarding from "
            //  << rq->uri().to_str().c_str()
            //  << " -- failed to dispatch error message to client: "
            //  << e.what();
        }
        delete [] buf;
        close(clientFD);
        close(destSockFD);
        return;
    }
    close(destSockFD);
    // TODO: provide/substitute headers makign client aware of the redirection
    // forward response
    try {
        resp.dispatch( clientFD
                     , buf, fwIOBufLen
                     , L );
    } catch( std::exception & e ) {
        L.error(util::format("While back-forwarding from %s : failed to"
                " communicate response to forwarded request to the client: %s"
                , rq->uri().to_str().c_str()
                , e.what()
                ).c_str());
        //L << log4cpp::Priority::ERROR
        //  << "While back-forwarding from "
        //  << rq->uri().to_str()
        //  << "Failed to communicate response to forwarded request to the client: "
        //  << e.what();
    }
    delete [] buf;
    close(clientFD);
    delete rq;
}  // _run_forward_request()

Server::HandleResult
ProcForawrdingEndpoint::handle( const RequestMsg & rq
                              , int clientFD
                              , const Server::iRoute::URLParameters & urlParams
                              ) {
    auto urlParIt = urlParams.find("procID");
    assert(urlParams.end() != urlParIt && !urlParIt->second.empty());  // guaranteed by rx
    auto subProcIt = _processes.children().find(urlParIt->second);

    // if child process does not exist or stopped, return errors
    if(subProcIt == _processes.children().end()) {
        auto resp = std::make_shared<ResponseMsg>(Msg::NotFound);
        YAML::Node node;
        node["errors"] = YAML::Node(YAML::NodeType::Sequence);
        node["errors"][0] = "Child process does not exist.";
        RESTTraits<YAML::Node>::set_content(*resp, node, _L);
        return {0x0, resp};
    }
    if(!subProcIt->second.isRunning) {
        auto resp = std::make_shared<ResponseMsg>(Msg::Gone);
        YAML::Node node;
        node["errors"] = YAML::Node(YAML::NodeType::Sequence);
        node["errors"][0] = "Child process terminated.";
        RESTTraits<YAML::Node>::set_content(*resp, node, _L);
        return {0x0, resp};
    }

    // make new URI for the request
    URI newUri(rq.uri());
    newUri.host(subProcIt->second.host);
    newUri.port(subProcIt->second.port);

    urlParIt = urlParams.find("remainder");
    assert(urlParams.end() != urlParIt && !urlParIt->second.empty());  // guaranteed by rx
    // New path is ussumed to have the same prefix as this resource. We
    // concatenate path prefix with path remnant to get new URI
    newUri.path(urlParIt->second);

    if(0 == _fwIOBufLen) {
        auto resp = std::make_shared<ResponseMsg>(Msg::MovedPermanently);
        YAML::Node node;
        node["errors"] = YAML::Node(YAML::NodeType::Sequence);
        node["errors"][0] = "Forwarding is not supported; direct access is advised.";
        RESTTraits<YAML::Node>::set_content(*resp, node, _L);
        resp->set_header("location", newUri.to_str());
        return {0x0, resp};
    }
    
    // otherwise, fork a thread to serve forwarding connection
    auto subRq = new RequestMsg(rq);
    subRq->uri(newUri);
    _L.debug(util::format("Dispatching proxying %s -> %s (sub-process \"%s\""
                " on host \"%s\", port #%d)."
                , rq.uri().to_str().c_str()
                , newUri.to_str().c_str()
                , subProcIt->first.c_str()
                , subProcIt->second.host.c_str()
                , subProcIt->second.port
                ).c_str());
    //_L  << log4cpp::Priority::DEBUG
    //    << "Dispatching proxying " << rq.uri().to_str()
    //    << " -> " << newUri.to_str() << " (sub-process \"" << subProcIt->first
    //    << "\" on host \"" << subProcIt->second.host << ", port #"
    //    << subProcIt->second.port << ").";
    auto tPtr = new std::thread( _run_forward_request
                               , subRq
                               , clientFD
                               , subProcIt->second.port
                               , subProcIt->second.host
                               , _L
                               , _fwIOBufLen
                               , _maxInMemContentLen
                               );
    //_forwardingConnections.push_back(tPtr);
    tPtr->detach();
    delete tPtr;
    return { Server::kKeepClientConnection
           | Server::kNoDispatchResponse
           , nullptr
           };
}

void
ProcForawrdingEndpoint::join_all_forwarding_connections() {
    //for( auto thPtr : _forwardingConnections ) {
    //    thPtr->join();
    //    delete thPtr;
    //}
    //_forwardingConnections.clear();
}

//
// Processes resource

URI
ProcessResource::child_url(const std::string & childName) const {
    auto it = children().find(childName);
    if(it != children().end())
        return child_url(it->first, it->second.host, it->second.port);
    throw errors::NoSuchChildProcess(childName.c_str());
}

URI
ProcessResource::child_url( const std::string & childName
                          , const std::string & childHost
                          , uint16_t childPort
                          ) const {
    URI uri;
    uri.scheme("http");  // todo: support for https scheme?
    #if 0
    if(0 != _fwIOBufLen) {
        // to forward requests, own host/port must be used
        uri.host(_srv.host().empty() ? "localhost" : _srv.host());
        uri.port(_srv.port());
        uri.path(path_for({{"procID", childName}}));
    } else {
        uri.host(entry.host.empty() ? "localhost" : entry.host);
        uri.port(entry.port);
        uri.path(_urlPrefix);  // todo: check
    }
    #else
    if(_forwardingRoutePtr) {  // forwarding endpoint exists
        uri.path(_forwardingRoutePtr->path_for({{"procID", childName}, {"remainder", "/"}}));
        // use THIS server's host and port (to forward requests)
        uri.host(_srv.host());
        uri.port(_srv.port());
        // assure redirection will work
        #if 1
        URLParameters check;
        if( (!_forwardingRoutePtr->can_handle(uri.path(), check))
          ||(childName != check["procID"]) ) {
            // This is server's self-check that makes sure that client's
            // reuests on the `_link` will reach the forwarding routine. It
            // can be failed if, for instance `_fwdRouteRx` is not valid
            // (containing unescaped chars)...
            char errBf[256];
            snprintf( errBf, sizeof(errBf)
                    , "Generated path in subprocess URL does not"
                    " match forwarding pattern: \"%s\", childName=\"%s\""
                    , uri.path().c_str()
                    , childName.c_str()
                    );
            throw std::logic_error(errBf);
        }
        #endif
    } else {  // no forwarding enpoint present -- respond with direct URL
        uri.port(childPort);
        uri.host(childHost.empty() ? "localhost" : childHost);
    }
    #endif
    return uri;
}

void
ProcessResource::_append_node_with_child_details( const std::string & nm
                                                , const Processes::ChildProcess & cp
                                                , YAML::Node & n ) {
    n["port"] = cp.port;
    n["isRunning"] = cp.isRunning;
    n["host"] = cp.host;
    n["procAPIPrefix"] = cp.procAPIPrefix;
    if(cp.isRunning) {
        // compose URL for forwarding link
        URI childURI = child_url(nm, cp.host, cp.port);
        n["_link"] = childURI.to_str();
    } else {
        if(cp.stopSignal)
            n["stopSignal"] = cp.stopSignal;
        else
            n["exitCode"] = cp.exitCode;
    }
}

YAML::Node
ProcessResource::get( const YAML::Node & rqPayload
                    , const URLParameters & urlParams
                    ) {
    YAML::Node r;
    auto ppIt = urlParams.find("procID");
    if(ppIt != urlParams.end() && !ppIt->second.empty()) {
        const std::string subPName = ppIt->second;
        auto pIt = children().find(subPName);
        if(pIt == children().end()) {
            r["errors"] = YAML::Node(YAML::NodeType::Sequence);
            r["errors"][0] = "No such child process.";
            _current_response_object().status_code(Msg::NotFound);
            return r;
        } 
        // refresh child process status (if not running) and response with
        // known details
        _refresh_child_status(subPName);
        _append_node_with_child_details(pIt->first, pIt->second, r);
        return r;
    } else {
        refresh_children_status();
        // response with this process details
        r["version"] = SYNC_HTTP_SRV_VERSION;
        r["children"] = YAML::Node(YAML::NodeType::Map);
        for( auto item : children() ) {
            YAML::Node cn(YAML::NodeType::Map);
            _append_node_with_child_details(item.first, item.second, cn);
            r["children"][item.first] = cn;
        }
        _append_process_details( _current_request_object()
                               , rqPayload
                               , urlParams
                               , r
                               );
    }
    return r;
}

YAML::Node
ProcessResource::post(const YAML::Node & rq, const URLParameters & urlParams) {
    // TODO: here the request can be redirected to another host to spawn
    //       sub-process there, based on the request details, but it is not
    //       implemented currently;
    std::string subProcHost = ""
              , procAPIPrefix = rq["procAPIPrefix"] ? rq["procAPIPrefix"].as<std::string>() : _urlPrefix
              ;
    uint16_t childPort = 0;
    // ^^^ TODO: steer by request, currently it is
    //     "always localhost" on "some available" port

    // find vacant name, prepare subproc entry and url
    std::string name = _vacant_proc_name(( rq["name"] && !rq["name"].as<std::string>().empty()
                                         ? rq["name"].as<std::string>()
                                         : "subproc"
                                         ));
    // NOTE: subURL returned here for non-forwarding children will have
    // uninitialized port.
    URI subURL = child_url(name, subProcHost, childPort);
    auto cpStruct = fork_server( name
                               , subProcHost, childPort
                               , procAPIPrefix
                               );
    if( cpStruct.pid ) {  // in parent process:
        assert(_rqPtr);
        assert(!*_rqPtr);
        // we're in parent process
        YAML::Node response;  // empty node
        //response["pid"] = (int) cpStruct.pid;  // todo: unclear whether we shall put it here...
        //response["port"] = childPort;
        // set "Location" header of newly created resource
        _current_response_object().set_header("Location", subURL.to_str());
        _current_response_object().status_code(Msg::Created);
        return response;
    } else {  // in child process
        // abrupt client request treatment, stop
        // parent's server instance, close all connections
        assert(_rqPtr);
        assert(!*_rqPtr);
        *_rqPtr = new SpawnRequestDetails{ _current_request_object()
                                         , rq
                                         , urlParams
                                         , name
                                         , subURL
                                         };
        _srv.set_stop_flag();
        _set_no_dispatch_response();
        return YAML::Node();
    }
}

YAML::Node
ProcessResource::delete_(const YAML::Node &, const URLParameters &) {
    // TODO: send sigterm, wait for term, etc
    _current_response_object().status_code(Msg::NotImplemented);
    return YAML::Node();
}

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

