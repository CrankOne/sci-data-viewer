#pragma once

#include "sync-http-srv/error.hh"
#include "sync-http-srv/logging.hh"
#include "sync-http-srv/resource.hh"
#include "sync-http-srv/resource-yaml.hh"

/**\file
 * \brief Implementation of HTTP-driven forking processes resource
 *
 * This file offers a system of three classes:
 *  - `Processes` is a data container maintaining child (forked) process. It
 *    hides all the details of the forking procedure, offering user code
 *    a basic interface to steer the sub-processes.
 *  - `ProcessResource` is a RESTful view adapting `Processes` interface to
 *    RESTful API
 *  - `ProcForawrdingEndpoint` implements request/response forwarding
 *    capabilities. Plays a role of little proxy.
 *
 * Albeit `Processes` can be in principle used standalone, the interconnection
 * between these three classes is really tight.
 * */

#include <thread>

namespace sync_http_srv {
namespace errors {
/// Thrown by method(s) of `ChildProcess` in case of requested process is not
/// found; made for compat with HTTP error-reporting routines
class NoSuchChildProcess : public RequestError {
public:
    NoSuchChildProcess(const char * nm)
        : RequestError(util::format("No child process \"%s\"", nm).c_str(), 404) {}
};

// TODO: doc
class RepeatativeBinding : public GenericRuntimeError {
public:
    RepeatativeBinding()
        : GenericRuntimeError("Repeatative binding of forwarding endpoint to"
                " same \"Processes\" instance.") {}
};

// TODO: doc
class MaxProcessNumberExceed : public GenericRuntimeError {
public:
    MaxProcessNumberExceed()
        : GenericRuntimeError("Max process name number exceed.") {}
};

/// Thrown on failure of `fork()` call
class ForkFailed : public GenericRuntimeError {
public:
    ForkFailed(const char * cErrMsg)
        : GenericRuntimeError(util::format("fork() failed: %s", cErrMsg).c_str())
        {}
};

}  // namespace errors

namespace util {
namespace http {

class ProcForawrdingEndpoint;  // fwd

/// Maintains index of child processes providing HTTP server capabilities
class Processes {
public:
    /// Sub-server (forked process') constructor
    ///
    /// Accepts host name (can be empty for localhost) and port number (can be
    /// zero for "first available")
    typedef std::function<Server*(const std::string &, uint32_t)> SrvCtr;
    /// Sub-process entry type
    struct ChildProcess {
        pid_t pid;
        /// Port of running/dead sub-process
        uint16_t port;
        /// True if process is still considered as running
        bool isRunning;
        int exitCode  ///< set on `exit()` termination
          , stopSignal;  ///< set on termination by signal
        /// Process' host
        std::string host;
        /// Process' API prefix
        std::string procAPIPrefix;
    };
private:
    iJournal & _L;
    /// Index of known child processes
    std::unordered_map<std::string, ChildProcess> _children;
    ///\brief Sub-server constructing function (usually, user-code specified lambda)
    ///
    /// Server instance must be allocated using `new`. is used to create
    /// sub-server instance before `fork()` and retrieve its port number (so
    /// instance remaining in parent process gets immediately deleted then).
    SrvCtr _subSrvCtr;
    /// Used by child processes
    Server * _newSrv;
    /// Forwarding endpoint
    ProcForawrdingEndpoint * _fwdEndpoint;
protected:
    /// Server instance currently in use
    Server & _srv;
    /// Returns vacant process' name with given suffix
    ///
    /// Internal helper function that produces name for new process based on
    /// following rules:
    ///  - returns `nm` if there is no entry with `nm` in `_children`
    ///  - returns `"nm-N"` where N is the first orderly number of non-existing
    ///    name in `_children`.
    std::string _vacant_proc_name(const std::string & nm) const;
    /// Refreshes particular process run status
    void _refresh_child_status(const std::string &);
protected:
    void _bind_forwarding_endpoint(ProcForawrdingEndpoint *);
public:
    Processes(Server & srv, SrvCtr srvCtr, iJournal & l)
        : _L(l)
        , _subSrvCtr(srvCtr)
        , _newSrv(nullptr)
        , _fwdEndpoint(nullptr)
        , _srv(srv)
        {}
    /// Refreshes all children process statuses
    void refresh_children_status();
    /// Returns RO map of children processes
    const decltype(_children) & children() const { return _children; }

    /// Spawns child process
    ///
    /// \param name Process name
    /// \param subProcHost host to run subprocess
    /// \param childPort port for subprocess
    /// \param procAPIPrefix path prefix where proc API will reside
    /// \returns child process entry (PID won't be set for children)
    ChildProcess fork_server( const std::string &
                            , const std::string & subProcHost, uint16_t & childPort
                            , const std::string & procAPIPrefix
                            );
    /// Returns new ("next") server instance ptr, used by spawned children
    /// after `fork()`
    Server * new_server_ptr() { return _newSrv; };

    friend class ProcForawrdingEndpoint;
};


/**\brief Forwards requests to certain child process
 *
 * \note route shall guarantee presense of non-empty groups "procID" and
 *       "remainder".
 *
 * \note Although there is still method `join_all_forwarding_connections()`
 *       we've decided to go for detached threads instead.
 * */
class ProcForawrdingEndpoint : public Server::iEndpoint {
private:
    /// Set of processes to forward to
    Processes & _processes;
    /// Forwarding IO buffer size; can be set to `0` to disable forwarding
    const size_t _fwIOBufLen;
    /// Max in-memory content length
    const size_t _maxInMemContentLen;
    /// List of active threads that serve forwarding connections
    //std::list<std::thread *> _forwardingConnections;
protected:
    iJournal & _L;
public:
    ProcForawrdingEndpoint( Processes & processes
                          , size_t fwIOBufLen
                          , size_t maxInMemContentLen
                          , iJournal & logCat
                          )
        : _processes(processes)
        , _fwIOBufLen(fwIOBufLen)
        , _maxInMemContentLen(maxInMemContentLen)
        , _L(logCat)  // log4cpp::Category::getInstance(_L.getName() + ".routing");
        { _processes._bind_forwarding_endpoint(this); }
    /// Communicates request/response exchange to subprocess (does proxying)
    Server::HandleResult handle( const RequestMsg & rq
                               , int clientFD
                               , const Server::iRoute::URLParameters &
                               ) override;
    ///\brief Waits till all the forwarding connections are done
    ///
    /// Done prior `fork()` to avoid thread ptr duplicates.
    void join_all_forwarding_connections();
};

/**\brief Represents forking processes tree as resource
 *
 * This is a base class for "processes" resource provided by running
 * application. It is used to steer the server and fork to subprocesses.
 * Subclasses customizes get/post/patch/delete behaviour. It also may serve as
 * a proxy forwarding requests to its subprocesses.
 */
class ProcessResource : public SpecializedResource<YAML::Node>
                      , public Processes
                      {
public:
    /// Structure keeping details on fork()'ing request
    struct SpawnRequestDetails {
        /// Copy of request message caused spawning
        RequestMsg request;
        /// Copy of parsed body of request message
        YAML::Node cfg;
        /// URL parameters of request caused fork()
        URLParameters urlPars;

        /// Name of (current) subprocess
        const std::string subprocessName;
        /// Base URL for current subprocess
        ///
        /// This is important base URL of running process as it is expected
        /// that responses will submit this URL (i.e. in "Location") instead
        /// of process'es own in case of forwarded requests.
        URI subprocessURL;
    };
protected:
    const std::string _urlPrefix;
    /// Config brought by spawning process
    SpawnRequestDetails ** _rqPtr;
    /// Pointer to forwarding route
    Server::iRoute * _forwardingRoutePtr;

    /// Extended path regular expression, used to figure out whether the
    /// request must be forwarded to subprocess
    //std::regex _fwdRouteRx;
    /// Frowarding connection dictionary
    //...

    /// Used to add child's details to the response node
    virtual void _append_node_with_child_details( const std::string &
                                                , const Processes::ChildProcess &
                                                , YAML::Node & );

    /// Override this to append (sub)process-spicific response fields
    virtual void _append_process_details( const RequestMsg &  // original request
                                        , const YAML::Node &  // parsed requst body
                                        , const URLParameters & // URL parameters
                                        , YAML::Node &  // destination node
                                        ) {}
public:
    /**\brief Construct "process resource" instance
     *
     * Configures instance to run within `srv` instance (but does not
     * automatically adds resource's route to server).
     *
     * \param srv handle is needed only to stop server instance when child
     *        process is spawned, within the created child instance (via
     *        `Server::set_stop_flag()`.
     * \param subSrvCtr is copied to `_subSrvCtr`, see attr's doc
     * \param basePrefix must be first part of path used to address this
     *        resource (for instance, `/api/v0/proc`).
     * \param logCat logging category ref
     * \param forwardingRoutePtr is used to forward requests. Set to `0` to
     *        disable forwarding.
     * \param rqPtr is used by child process to communicate spawning request back.
     * */
    ProcessResource( Server & srv
                   , SrvCtr subSrvCtr
                   , const std::string & basePrefix
                   , iJournal & logCat
                   , Server::iRoute * forwardingRoutePtr
                   , SpawnRequestDetails ** rqPtr
                   ) : SpecializedResource<YAML::Node>( //"^" + str_replace(basePrefix, "/", "\\/")
                                                        //    + "(?:\\/([0-9A-Za-z\\-_]+)?)?$"
                                                      //, {{1, "procID"}}
                                                      //, basePrefix + "/{procID}/"
                                                    logCat
                                                      )
                     , Processes(srv, subSrvCtr, logCat)
                     , _urlPrefix(basePrefix)
                     , _rqPtr(rqPtr)
                     , _forwardingRoutePtr(forwardingRoutePtr)
                     //, _fwdRouteRx( "^" + str_replace(basePrefix, "/", "\\/") + "\\/([0-9A-Za-z\\-_]+)(\\/.*)$" )
                     {
    }

    ///\brief Adds subprocess-forwarding support
    ///
    /// This implementation adds "proxying" to subprocess, depending on the
    /// path parsing result. Requests with the non-empty `subProcs` group
    /// will become a subject of a thread execution.
    //Server::HandleResult handle(const RequestMsg &, int, const URLParameters &) override;

    /// Used by child process to configure itself
    SpawnRequestDetails * spawning_request()
        { return *_rqPtr; }

    /// Returns process tier tree
    YAML::Node get(const YAML::Node &, const URLParameters &) override;
    /// Spawns new sub-process
    YAML::Node post(const YAML::Node &, const URLParameters &) override;
    /// Stops sub-process
    YAML::Node delete_(const YAML::Node &, const URLParameters &) override;

    /// Returns forwarding URL for child process, tries to find process and
    /// returns result of `child_url(const std::string &, const ChildProcess &)`
    ///
    /// \throw `NoSuchChildProcess` if no process found
    URI child_url(const std::string &) const;
    /// Returns (forwarding) URL for child process
    ///
    /// Depending on whether current setup supports forwarding, resulting
    /// URL may differ. Returns URL (with path fragment if forwarding enabled).
    /// Servers of child processes has to consider this URL as basic to their
    /// paths.
    virtual URI child_url( const std::string &
                         , const std::string & childHost
                         , uint16_t childPort
                         ) const;
};  // class AppResource

}  // namespace ::sync_http_srv::util::http
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

