/* This file is a part of NA64SW software
 *
 * Copyright (C) 2015-2022 NA64 Collaboration, CERN
 *
 * NA64SW is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>. */

#include "na64app/app.hh"
#include "na64app/extension.hh"
#include "na64util/gsl-integration.hh"
#include "na64util/log4cpp-extras.hh"
#include "na64util/YAMLLog4cppConfigurator.hh"
#include "http/routes-view.hh"
#include "na64dp/abstractEventSource.hh"
#include "na64dp/pipeline.hh"
#include "na64event/data/event.hh"

#include "resources/processes.hh"
#include "resources/event.hh"
#include "resources/geometry.hh"

#if defined(ROOT_FOUND) && ROOT_FOUND
#   include "na64util/ROOT-sighandlers.hh"
#endif

#include <getopt.h>
#include <gsl/gsl_errno.h>

#include <log4cpp/Priority.hh>
#include <log4cpp/OstreamAppender.hh>
#include <log4cpp/PropertyConfigurator.hh>

#if defined(ROOT_FOUND) && ROOT_FOUND
#   include <TFile.h>
#endif

#ifndef NA64SW_SRV_DEFAULT_PORT_NO
#   define NA64SW_SRV_DEFAULT_PORT_NO 5657
#endif

#ifndef NA64SW_SRV_DEFAULT_BACKLOG
#   define NA64SW_SRV_DEFAULT_BACKLOG 8  // TODO: this is for test
#endif

#ifndef NA64SW_SRV_DEFAULT_TIMEOUT
#   define NA64SW_SRV_DEFAULT_TIMEOUT 15  // TODO: this is for test
#endif

#ifndef NA64SW_SRV_SEND_RECV_BUFFER_SIZE
#   define NA64SW_SRV_SEND_RECV_BUFFER_SIZE (128)  // TODO: this is for test, enlarge to, say 48*1024
#endif

// Max bytes allowed for in-memory content, otherwise tmp file must be used
#ifndef NA64SW_HTTP_MAX_IN_MEMORY_CONTENT_SIZE
#   define NA64SW_HTTP_MAX_IN_MEMORY_CONTENT_SIZE (10*1024*1024)
#endif

struct RouteConfig {
    std::string rxPattern
              , strPattern
              ;
    std::unordered_map<size_t, std::string> groups;
};

static const std::unordered_map<std::string, RouteConfig> * _gRoutesConfig = nullptr;
#if 0
// TODO: probably, shall become a config file?
= {
    { "proc",  // mame
        { "^\\/api\\/proc(?:\\/([0-9A-Za-z\\-_]+)?)?$"  // rx
        , "/api/proc/{procID}"  // strPattern
        , {{1, "procID"}}  // groups
        }
    },
    { "proc-fwd",  // mame
        { "^\\/api\\/proc\\/([0-9A-Za-z\\-_]+)(\\/.+)$"  // rx
        , "/api/proc/{procID}/{remainder}"  // strPattern
        , {{1, "procID"}, {2, "remainder"}}  // groups
        }
    },
    { "events",  // mame
        { "^\\/api\\/events$"  // rx
        , "/api/events"  // strPattern
        , {{}}  // groups
        }
    },
    // ...
};
#endif

struct ApplicationConfig {
    /// Port number for initial process to communicate with middleware.
    int port;
    /// File path for logging configuration
    std::string logCfg;
    /// Base URL path to reach the API
    std::string urlPathPrefix;
    /// Socket backlog (# of connections)
    int backlog;
    /// Connection timeout, sec
    uint32_t conTimeout;
    /// Network message IO buffer size (bytes)
    size_t ioBufSize;
    /// Max in-memory content size (bytes)
    size_t maxInMemContentBytes;
    /// Enables master process forwarding to children
    bool procForwarding;
    // ...
};

static void
_initialize_defaults( ApplicationConfig & appCfg ) {
    appCfg.port = NA64SW_SRV_DEFAULT_PORT_NO;
    appCfg.logCfg = NA64SW_PREFIX "/etc/na64sw/logging.yaml";
    appCfg.urlPathPrefix = "/api/proc";
    appCfg.backlog = NA64SW_SRV_DEFAULT_BACKLOG;
    appCfg.conTimeout = NA64SW_SRV_DEFAULT_TIMEOUT;
    appCfg.ioBufSize = NA64SW_SRV_SEND_RECV_BUFFER_SIZE;
    appCfg.maxInMemContentBytes = NA64SW_HTTP_MAX_IN_MEMORY_CONTENT_SIZE;
    appCfg.procForwarding = true;
}

static void
_usage_info( const char * appName
           , std::ostream & os
           , const ApplicationConfig & cfg
           ) {
    os << "\033[1mNA64sw data processing server application\033[0m" << std::endl
       << "Usage:" << std::endl
       << "  $ \033[1m" << appName
       << "\033[0m [-h,--help] "
          " [-p,--port <number>]"
          " [-J,--log-cfg <file>]"
          " [--url-path-prefix <path>]"
          " [--backlog <no.connections>]"
          " [-t,--timeout <sec>]"
          " [--nw-buffer-size <no.bytes>]"
          " [--max-in-mem-content-len <no.bytes>]"
          " [--no-fwd]"
          " [--no-banner]"
       << std::endl;
    os << "where:" << std::endl
       << "  \033[0;32m-J,--log-cfg\033[0m <log4cppConfig=\033[2m"
       << cfg.logCfg << "\033[0m> is log4cpp configuration"
          " \"properties\" file that sets up logging configuration (sinks,"
          " layouts, etc)." << std::endl
       << "  \033[0;32m-p,--port\033[0m <portNo=\033[2m" << cfg.port << "\033[0m>"
          " sets the port number for root process to communicate."
       << std::endl
       << "  \033[0;32m--url-path-prefix\033[0m <urlPath=\033[2m"
       << cfg.urlPathPrefix << "\033[0m>"
          " common path prefix for HTTP connections. Warning: beware trailing"
          " slash!"
       << std::endl
       << "  \033[0;32m--backlog\033[0m <no.connections=\033[2m" << cfg.backlog
       << "\033[0m> common path prefix for HTTP connections."
       << "  \033[0;32m-t,--timeout\033[0m <sec=\033[2m" << cfg.conTimeout
       << "\033[0m>"
          " network socket connection timeouts, seconds."
       << std::endl
       << "  \033[0;32m--nw-buffer-size\033[0m <no.bytes=\033[2m"
       << cfg.ioBufSize << "\033[0m>"
          " network IO buffer length. Affects max header length."
       << std::endl
       << "  \033[0;32m--max-in-mem-content-len\033[0m <no.bytes=\033[2m"
       << cfg.maxInMemContentBytes << "\033[0m>"
          " request/response content beyond this limit will be cached on disk."
       << std::endl
       << "  \033[0;32m--no-fwd\033[0m"
          " Disables request forwarding through master process."
       << std::endl
       << "  \033[0;32m--no-banner\033[0m"
          " Disables banner and copyright information printed by default."
       << std::endl
       ;
}

int set_app_config( int argc, char * argv[]
                  , ApplicationConfig & cfg ) {
    static struct option longOpts[] = {
        { "help",                   no_argument,       NULL, 'h' },
        { "port",                   required_argument, NULL, 'p' },
        { "log-cfg",                required_argument, NULL, 'J' },
        { "url-path-prefix",        required_argument, NULL, 0x0 },
        { "backlog",                required_argument, NULL, 0x0 },
        { "nw-buffer-size",         required_argument, NULL, 0x0 },
        { "max-in-mem-content-len", required_argument, NULL, 0x0 },
        { "no-fwd",                 no_argument,       NULL, 0x0 },
        { "no-banner",              no_argument,       NULL, 0x0 },
        { NULL, 0x0, NULL, 0x0 },
    };
    std::string listToks;
    int c, optIdx;
    std::string pstr;
    bool hadError = false, noBanner = false;
    // Iterate over command line options to set fields in appCfg
    while((c = getopt_long( argc, argv, "p:J:h"
                          , longOpts, &optIdx )) != -1 ) {
        switch(c) {
            case '0' :
                if(!strcmp( longOpts[optIdx].name, "no-banner" )) {
                    noBanner = true;
                } else if(!strcmp( longOpts[optIdx].name, "url-path-prefix" )) {
                    cfg.urlPathPrefix = optarg;
                } else if(!strcmp( longOpts[optIdx].name, "backlog" )) {
                    cfg.backlog = std::stoi(optarg);
                } else if(!strcmp( longOpts[optIdx].name, "nw-buffer-size" )) {
                    cfg.ioBufSize = std::stoul(optarg);
                } else if(!strcmp( longOpts[optIdx].name, "max-in-mem-content-len" )) {
                    cfg.maxInMemContentBytes = std::stoi(optarg);
                } else if(!strcmp( longOpts[optIdx].name, "no-fwd" )) {
                    cfg.procForwarding = false;
                } else {
                    std::cerr << "Unable to parse option \""
                              << longOpts[optIdx].name << "\""  << std::endl;
                    hadError = true;
                }
            break;
            case 'p' :
                cfg.port = atol(optarg);
                break;
            case 'J' :
                cfg.logCfg = optarg;
                break;
            // ... more runtime options may be added here
            case 'h' :
                _usage_info( argv[0], std::cout, cfg );
                return -1;
            case ':' :
                std::cerr << "Option \"" << (char) optopt << "\" ("
                          << (int) optopt << ") requires an argument."
                          << std::endl;
                hadError = true;
                break;
            case '?' :
                std::cerr << "Unrecognized option \"" << (char) optopt << "\" ("
                          << (int) optopt << ")."
                          << std::endl;
                hadError = true;
        }
    }
    if( hadError )
        return -2;
    if( !noBanner ) {
        na64dp::util::print_banner( std::cout
                , "NA64 data processing software (HTTP-driven pipeline server)");
    }
    return 0;
}

//                                                            _________________
// _________________________________________________________/ Process Resource

struct ProcState {
    // misc
    /// Event processing info instance (TODO, unused)
    na64dp::iEvProcInfo * epi;
    /// Process-wide calibration manager
    na64dp::calib::Manager * calibMgrPtr;
    /// Detector naming handle for common usage
    na64dp::calib::Handle<na64dp::nameutils::DetectorNaming> * commonNamingHandle;
    #if defined(ROOT_FOUND) && ROOT_FOUND
    /// Common ROOT output file
    TFile * rootOutputFile;
    #endif
    // input
    /// Input config
    YAML::Node inputCfg;
    /// List of inputs
    std::vector<std::string> inputs;
    /// Ptr to event source
    na64dp::AbstractEventSource * evSrc;
    // ppl
    /// Processing config
    YAML::Node runCfg;
    /// Ptr to processing pipeline
    na64dp::Pipeline * pipeline;

    /// For plain block pool allocator -- size
    size_t evBufSize;
    /// Ptr to event buffer
    void * evBuffer;
    /// Plain block allocator instance ptr
    na64dp::mem::PlainBlock * evMemBlockPtr;
    /// Local memory for events
    na64dp::LocalMemory * lmemPtr;
    /// Common instance
    na64dp::mem::Ref<na64dp::event::Event> evRef;

    ProcState() : epi(nullptr)
                , calibMgrPtr(nullptr)
                , commonNamingHandle(nullptr)
                #if defined(ROOT_FOUND) && ROOT_FOUND
                , rootOutputFile(nullptr)
                #endif
                , evSrc(nullptr)
                , pipeline(nullptr)
                , evBufSize(0)
                , evBuffer(nullptr)
                , evMemBlockPtr(nullptr)
                , lmemPtr(nullptr)
                {}
};

/** Process-specific extension on default `ProcessResource` implementation
 *
 * This class extends response with some additiona information on running
 * process state. */
class ProcessResource : public na64dp::util::http::ProcessResource {
protected:
    ProcState & _procState;

    void _append_process_details( const na64dp::util::http::RequestMsg &  rq // original request
                                , const YAML::Node & rqNode // parsed requst body
                                , const URLParameters & urlParams // URL parameters
                                , YAML::Node & r  // destination node
                                ) override {
        // report on current application state (`ProcState' instance)
        r["epi"] = _procState.epi ? true : false;
        r["calibMgr"] = _procState.calibMgrPtr ? true : false;
        #if defined(ROOT_FOUND) && ROOT_FOUND
        r["ROOTFile"] = _procState.rootOutputFile ? true : false;
        #else
        r["ROOTFile"] = false;
        #endif
        r["inputSource"] = _procState.evSrc ? true : false;
        r["pipeline"] = _procState.pipeline ? true : false;
        r["event"] = YAML::Node(YAML::NodeType::Map); {
            r["event"]["buffer"] = _procState.evBuffer ? true : false;
            r["event"]["lmem"] = _procState.lmemPtr ? true : false;
            r["event"]["instance"] = _procState.evRef ? true : false;
            // type-dependant
            r["event"]["memBlock"] = _procState.evBuffer ? true : false;
        }
        // TODO: look at query string, add registered extensions classes
        //auto extsNode = YAML::Node(YAML::NodeType::Map);
        //na64dp::util::list_registered_extensions(extsNode);
        //respNode["extensions"] = extsNode;

        // add available run configs
        //auto cfgRootDirs = na64dp::util::expand_names("${NA64SW_RUN_CFG_PATH}");
        // ...
        // TODO: ... proc config, available extensions, configs, etc
    }
public:
    ProcessResource( ProcState & procState
                   , na64dp::util::http::Server & srv
                   , SrvCtr srvCtr
                   , const std::string & basePrefix
                   , log4cpp::Category & logCat
                   , na64dp::util::http::Server::iRoute * forwardingRoutePtr
                   , na64dp::util::http::ProcessResource::SpawnRequestDetails ** rqPtr
                   //, size_t fwdIOLen
                   //, size_t maxInMemContentLen
                   ) : na64dp::util::http::ProcessResource( srv, srvCtr,
                            basePrefix, logCat, forwardingRoutePtr, rqPtr)
                            //fwdIOLen, maxInMemContentLen )
                     , _procState(procState)
                     {}
};

// Essentially, a main application logic is provided here -- depending on
// spawning request, instantiate and configure resources to be served.
//
// This is called in a new-born (sub)process to setup the resources for
// particular purpose. Note, that all the parent's resources are deleted, so
// current (spawning) process should create new route instances based on the
// application state.
//
// Returned flag instructs caller code whether or not instantiated set of
// resources anticipates child processes.
//
// TODO: error in this function should leave some traces for the server to
//       report client on error. Depending on future implementation, various
//       `NA64DP_RUNTIME_ERROR` should be probably substituted.
static bool
_configure_resources( ProcState & procState
                    , na64dp::util::http::Server::Routes & routes
                    , const na64dp::util::http::ProcessResource::SpawnRequestDetails * spRqPtr
                    ) {
    auto & L = log4cpp::Category::getInstance("httpServer.resources");
    if(!spRqPtr) { return true; }  // Root process, no additional routes
    //const std::unordered_map<std::string, std::string> & rqPathParams = spRqPtr->parameters;
    const YAML::Node & cfg = spRqPtr->cfg;
    // ...access HTTP request with spRq->request->client_ip() etc
    if(!cfg.IsMap()) {
        NA64DP_RUNTIME_ERROR("Request is not a map.");
    }

    //                      * * *   * * *   * * *
    // Because of the large amount of YAML try-catch code, some additional
    // decorations used to highlight imortant code after 80th character

    // 1. Load extensions // -------------------------------------------------
    //    must be a map of <extension name> : { extension param : value }
    if(cfg["extensions"]) {
        // TODO: make ProcState::lodadedExtensions set, append it depending on
        //       rc to prevent from repeating extensions loading here
        std::list<std::string> extensions;
        if(!cfg["extensions"].IsSequence()) {
            NA64DP_RUNTIME_ERROR("Request error: \"extensions\" is not a list.");
        }
        for(auto & extensionItem : cfg["extensions"]) {
            std::string extensionName;
            try {
                extensionName = extensionItem.as<std::string>();
            } catch( YAML::Exception & e ) {
                NA64DP_RUNTIME_ERROR("Request error: extension name is not"
                        " a string (%s)", e.what());
            }
            extensions.push_back(extensionName);
        }
        // TODO: unfortunately, we can not capture extension loading errors so
        // far as they typically loaded before logging system initialized.
        int rc = na64dp::util::load_modules( extensions
                                           , getenv("NA64SW_MODULES_PATH") );   // <= load extension modules
        if(rc) {
            L << log4cpp::Priority::WARN
              << "There were errors while loading extensions (see stderr).";
        }
    }
    // 2. Configure calibrations // ------------------------------------------
    //    client shall refer to path
    //    TODO: enumerated files, optionally, user-specified calibration config
    if(cfg["calib-config"]) {
        if(procState.calibMgrPtr) {
            NA64DP_RUNTIME_ERROR("Calibration manager already instantiated.");
        }
        std::string calibCfgURI;
        try {
            // TODO: support user-provided node
            calibCfgURI = cfg["calib-config"].as<std::string>();
        } catch( YAML::Exception & e ) {
            NA64DP_RUNTIME_ERROR("Request error: \"calib-config\" is not a"
                    " string (%s)", e.what());
        }
        procState.calibMgrPtr = new na64dp::calib::Manager();                   // <= instantiate calib mgr
        try {
            na64dp::util::setup_default_calibration( *procState.calibMgrPtr
                                                   , calibCfgURI
                                                   );
            L << log4cpp::Priority::INFO << "Calibration manager configured"
                " from \"" << calibCfgURI << "\".";
        } catch(std::exception & e) {
            L << log4cpp::Priority::ERROR << "Failed to setup calibration"
                " manager from \"" << calibCfgURI << "\": " << e.what();
            throw e;
        }
        // bind naming handle
        procState.commonNamingHandle = new na64dp::calib::Handle<
                na64dp::nameutils::DetectorNaming>("default", *procState.calibMgrPtr);
        // instantiate geometry view
        auto endpoint = new na64dp::util::http::Geometry(
                      *procState.calibMgrPtr
                    , log4cpp::Category::getInstance("httpServer.resources.geometry")
                    );
        auto it = _gRoutesConfig->find("geometry");
        assert(it != _gRoutesConfig->end());
        auto route = new na64dp::util::http::RegexRoute( it->first
                                , it->second.rxPattern
                                , it->second.groups
                                , it->second.strPattern
                                );
        routes.push_back({route, endpoint});
    }
    if( procState.calibMgrPtr ) {
        // TODO: add calibration data routes/resource
    }
    //if(cfg["geometry"])
    // 3. Set extension parameters  // ---------------------------------------
    if(cfg["extParams"]) {
        if(!cfg["extParams"].IsMap()) {
            NA64DP_RUNTIME_ERROR("\"extParams\" is not a map.");
        }
        for(auto & parItem : cfg["extParams"]) {
            std::string parName, parValue;
            try {
                parName = parItem.first.as<std::string>();
            } catch( YAML::Exception & e ) {
                NA64DP_RUNTIME_ERROR("Extension parameter name is not a"
                            " string: %s", e.what());
            }
            try {
                parValue = parItem.second.as<std::string>();
            } catch( YAML::Exception & e ) {
                NA64DP_RUNTIME_ERROR("Parameter \"%s\" value is not a"
                        " string: %s", parName.c_str(), e.what());
            }
            na64dp::Extensions::self().set_parameter(parName, parValue);        // <= set runtime extension's
                                                                                //    parameters
        }
    }
    // 4. ROOT output  // ----------------------------------------------------
    if(cfg["ROOT-output"]) {
        #if defined(ROOT_FOUND) && ROOT_FOUND
        if(procState.rootOutputFile) {
            NA64DP_RUNTIME_ERROR("\"ROOT-output\" has already been set.")
        }
        std::string rootOutputFile;
        try {
            rootOutputFile = cfg["ROOT-output"].as<std::string>();
        } catch(YAML::Exception & e) {
            NA64DP_RUNTIME_ERROR("\"ROOT-output\" parameter is not a string (%s)"
                    , e.what() );
        }
        procState.rootOutputFile = new TFile( rootOutputFile.c_str()            // <= open ROOT file
                                            , "RECREATE");                      //    for output
        #else
        NA64DP_RUNTIME_ERROR("\"ROOT-output\" requested but build"
                " does not support ROOT");
        #endif
    }
    #if defined(ROOT_FOUND) && ROOT_FOUND
    if(procState.rootOutputFile) {
        // TODO: can we somehow return opened ROOT file content with JS? Might
        //       be useful to have a "ROOT file" resource avalable; (re)create
        //       its routes here.
    }
    #endif
    // 5. Event processing info (EPI)  // ------------------------------------
    // ... TODO
    // 6. Init extensions if they were provided  // --------------------------
    if(cfg["extensions"]) {
        // TODO: check newly loaded (above) extensions to avoid repeatative
        //       initialization
        if( !procState.calibMgrPtr ) {
            NA64DP_RUNTIME_ERROR("Can not initialize extensions as no"
                    " calibration manager available");
        }
        na64dp::Extensions::self().init(*procState.calibMgrPtr, procState.epi);           // <= init calib mgr
    }
    // 7. Instantiate input  // ----------------------------------------------
    if(cfg["input"]) {
        if( !procState.calibMgrPtr ) {
            NA64DP_RUNTIME_ERROR("Can not initialize input source as no"
                    " calibration manager available");
        }
        if(procState.evSrc) {
            // todo: re-create data source
            NA64DP_RUNTIME_ERROR("Data source already instantiated");
        }
        if(!cfg["input"].IsMap()) { NA64DP_RUNTIME_ERROR("\"input\" is not a map."); }
        if(!cfg["input"]["config"]) { NA64DP_RUNTIME_ERROR("\"input.config\" is empty/null."); }
        if(cfg["input"]["config"].IsScalar()) {
            const std::string inputCfgFileName = cfg["input"]["config"].as<std::string>();
            try {
                procState.inputCfg = YAML::LoadFile(inputCfgFileName);
            } catch(YAML::Exception & e) {
                NA64DP_RUNTIME_ERROR("Failed to load input config \"%s\": %s."
                        , inputCfgFileName.c_str()
                        , e.what()
                        );
            }
        } else {
            procState.inputCfg = cfg["input"]["config"];
        }
        try {
            procState.inputs = cfg["input"]["inputs"].as<std::vector<std::string> >();
            procState.evSrc = na64dp::VCtr::self().make<na64dp::AbstractEventSource>(
                    procState.inputCfg["_type"].as<std::string>(),
                    *procState.calibMgrPtr,
                    procState.inputCfg,
                    procState.inputs
                    );
        } catch(std::exception & e) {
            L.error( "During instantiation of the data source object an"
                    " exception occurred: \"%s\".", e.what() );
            throw;
        }
    }
    // 8. Instantiate pipeline  // -------------------------------------------
    if(cfg["pipeline"]) {
        if( !procState.calibMgrPtr ) {
            NA64DP_RUNTIME_ERROR("Can not initialize data processing pipeline"
                    " as no calibration manager available");
        }
        if(procState.pipeline) {
            // todo: re-create pipeline?
            NA64DP_RUNTIME_ERROR("Pipeline already instantiated.");
        }
        if(!cfg["pipeline"]) { NA64DP_RUNTIME_ERROR("\"pipeline\" is empty/null."); }
        if(cfg["pipeline"].IsScalar()) {
            const std::string path = cfg["pipeline"].as<std::string>();
            na64dp::RunCfg rcfg(path, getenv("NA64SW_RUN_CFG_PATH"));
            procState.runCfg = rcfg.get();
        } else if(cfg["pipeline"].IsSequence()) {
            YAML::Node n;
            n["pipeline"] = cfg["pipeline"];  // gotcha
            na64dp::RunCfg rcfg(n, getenv("NA64SW_RUN_CFG_PATH"));
            procState.runCfg = rcfg.get();
        } else {
            NA64DP_RUNTIME_ERROR("\"pipeline\" is not a path, nor a sequence.");
        }
        procState.pipeline = new na64dp::Pipeline( procState.runCfg["pipeline"]
                                                 , *procState.calibMgrPtr
                                                 , procState.epi
                                                 );
    }
    if(procState.pipeline) {
        // TODO: add pipeline resource routes
    }
    // 9. Allocate reentrant event buffer // ---------------------------------
    if(cfg["eventBuffer"]) {
        if(!cfg["eventBuffer"].IsMap()) {
            NA64DP_RUNTIME_ERROR("Request error: \"eventBuffer\" is not a map.");
        }
        if((!cfg["eventBuffer"]["_type"]) || !cfg["eventBuffer"]["_type"].IsScalar()) {
            NA64DP_RUNTIME_ERROR("Request error: \"eventBuffer._type\" is"
                    " absent or is not a scalar.");
            if(cfg["eventBuffer"]["_type"].as<std::string>() != "plainBlock") {
                NA64DP_RUNTIME_ERROR("Request error: \"eventBuffer._type\" is"
                    " \"%s\"; only \"plainBlock\" is currently supported."
                    , cfg["eventBuffer"]["_type"].as<std::string>().c_str() );
            }
        }
        // this is probably usable only for _type=PlainBlock; currently we have
        // no other allocators to understand well
        if(!cfg["eventBuffer"]["sizeKb"]) {
            NA64DP_RUNTIME_ERROR("Request error: \"eventBuffer.sizeKb\" is null.");
        }
        if(procState.evBuffer) {
            procState.evBufSize = 0;
            free(procState.evBuffer);
            procState.evBuffer = nullptr;
        }
        try {
            procState.evBufSize = cfg["eventBuffer"]["sizeKb"].as<size_t>()*1024;
        } catch(YAML::Exception & e) {
            NA64DP_RUNTIME_ERROR("Bad conversion of \"eventBuffer.sizeKb\": %s"
                    , e.what() );
        }
        if(procState.evBufSize <= 0) {
            procState.evBufSize = 0;
            NA64DP_RUNTIME_ERROR("Bad event buffer size.");
        }
        procState.evBuffer = malloc(procState.evBufSize);
        if(procState.evMemBlockPtr) {
            delete procState.evMemBlockPtr;
            procState.evMemBlockPtr = nullptr;
        }
        procState.evMemBlockPtr = new na64dp::mem::PlainBlock(procState.evBuffer, procState.evBufSize);
        if(procState.lmemPtr) {
            delete procState.lmemPtr;
            procState.lmemPtr = nullptr;
        }
        procState.lmemPtr = new na64dp::LocalMemory(*procState.evMemBlockPtr);
        procState.evRef = procState.lmemPtr->create<na64dp::event::Event>(*procState.lmemPtr);
        na64dp::util::reset(*procState.evRef);
    }

    if( procState.evSrc
     && procState.evRef.get()
     && procState.lmemPtr
      ) {
        auto endpoint = new na64dp::util::http::EventResource<YAML::Node>(
                      log4cpp::Category::getInstance("httpServer.resources.events")
                    , procState.evSrc
                    , *procState.evRef
                    , *procState.lmemPtr
                    , procState.inputs
                    , &procState.pipeline
                    , procState.commonNamingHandle
                    );
        auto it = _gRoutesConfig->find("event");
        assert(it != _gRoutesConfig->end());
        auto route = new na64dp::util::http::RegexRoute( it->first
                                , it->second.rxPattern
                                , it->second.groups
                                , it->second.strPattern
                                );
        routes.push_back({route, endpoint});
    }

    //                      * * *   * * *   * * *
    return true;
}

//                                                                 ____________
// ______________________________________________________________/ Entry point

int
main(int argc, char * argv[]) {
    //                                                               __________
    // ____________________________________________________________/ App infra
    #if defined(ROOT_FOUND) && ROOT_FOUND
    // disable ROOT signal handlers
    {
        const char * v = getenv("KEEP_ROOT_SIGHANDLERS");
        if( !v || !(v && ('1' == v[0] && '\0' == v[1] )) ) {
            disable_ROOT_sighandlers();
        } else {
            std::cerr << "ROOT signal handlers are kept." << std::endl;
        }
    }
    #endif
    na64dp::util::set_std_environment_variables();
    auto cfgRootDirs = na64dp::util::expand_names("${NA64SW_RUN_CFG_PATH}");
    setenv( "NA64SW_MODULES_PATH", NA64SW_MODULES_PATH_DEFAULT, 0 );
    // Set custom exception-throwing error handler for GSL
    /*old_handler = */ gsl_set_error_handler( na64dp::errors::GSLError::na64sw_gsl_error_handler );
    ApplicationConfig appCfg;
    _initialize_defaults( appCfg );
    int rc = set_app_config( argc, argv, appCfg );  // loads modules, may fork()
    if(  1 == rc ) {  // indicates parent process' exit (when forking)
        return EXIT_SUCCESS;  // TODO: use saved child's return code!
    }
    if( -2 == rc ) {  // error occured during initial application configuration
        _usage_info( argv[0], std::cerr, appCfg );
        return EXIT_FAILURE;
    }
    if( -1 == rc ) {  // one of the "single-action" options is given (-l, -h)
        return EXIT_SUCCESS;
    }
    //                                                                    _____
    // _________________________________________________________________/ Logs
    // Initialize logging subsystem
    na64dp::util::inject_extras_to_log4cpp();
    if( ! appCfg.logCfg.empty() ) {
        try {
            na64dp::util::YAMLLog4cppConfigurator::configure(appCfg.logCfg);
        } catch(std::exception & e) {
            std::cerr << "\033[1;31mError\033[0m: while configuring logging system on file \""
                      << appCfg.logCfg << "\": " << e.what() << std::endl;
            throw;
        }
    } else {
        log4cpp::Appender * consoleAppender
                = new log4cpp::OstreamAppender("console", &std::cout);
        consoleAppender->setLayout(new log4cpp::BasicLayout());
        log4cpp::Category & RL = log4cpp::Category::getRoot();
        RL.addAppender( consoleAppender );
        RL.info( "Using zero-conf logging." );
    }
    log4cpp::Category & RL = log4cpp::Category::getRoot();
    RL.info("Logging initialized.");
    if(rc > 0) {
        RL.error( "(There were errors during shared object loading before"
                " logging was initialized)" );
    }

    auto & L = log4cpp::Category::getInstance("httpServer");

    // Routes
    // TODO: probably, shall become a config file?
    _gRoutesConfig = new std::unordered_map<std::string, RouteConfig>{
                { "routes",
                    { "^\\/api\\/routes\\/?$"  // rx
                    , "/api/routes"  // strPattern
                    , {{}}  // groups
                    }
                },
                { "proc",  // name
                    { "^\\/api\\/proc(?:\\/([0-9A-Za-z\\-_]+)?)?$"  // rx
                    , "/api/proc/{procID}"  // strPattern
                    , {{1, "procID"}}  // groups
                    }
                },
                { "proc-fwd",  // name
                    { "^\\/api\\/proc\\/([0-9A-Za-z\\-_]+)(\\/.*)$"  // rx
                    , "/api/proc/{procID}{remainder}"  // strPattern
                    , {{1, "procID"}, {2, "remainder"}}  // groups
                    }
                },
                { "event",  // name
                    { "^\\/api\\/event\\/?$"  // rx
                    , "/api/event"  // strPattern
                    , {{}}  // groups
                    }
                },
                { "geometry",  // name
                    { "^\\/api\\/geometry\\/placements\\/?$"  // rx
                    , "/api/geometry\\/placements"  // strPattern
                    , {{}}  // groups
                    }
                },
                // ...
            };

    std::function<na64dp::util::http::Server *(const std::string &, uint16_t)> srvCtr
            = [&](const std::string & host, uint16_t portNo) {
            return new na64dp::util::http::Server( host
                , portNo
                , L
                , appCfg.backlog
                , appCfg.conTimeout
                , appCfg.ioBufSize
                , appCfg.maxInMemContentBytes
                );
        };

    //new na64dp::util::http::Server(_srv.host(), 0, _L/*, _srv.backlog()*/);
    // Instantiate HTTP server; this particular instance is the root one,
    // designed to spawn worker processes, optionally providing acces to
    // children as proxy
    auto srvPtr = srvCtr("", appCfg.port);
    // Pointer keeping last process-spawning request from parent. Initially
    // set to null pointer, a specific value to setup initial (root) process
    // resource (see `_configure_resources()`)
    na64dp::util::http::ProcessResource::SpawnRequestDetails *
        spawningRequestPtr = nullptr;
    ProcState procState;
    // Server loop working till there is a server instance
    while(srvPtr) {
        // Collection of routes served
        na64dp::util::http::Server::Routes routes;
        // Pointer to specific resource used to spawn child processes. It is
        // bound to the server instance and assumed to be used commonly, so
        // it is not instantiated by `_configure_resources()`
        ProcessResource * pr = nullptr;
        // Instantiate resources and fill routes list according to last
        // spawning request
        bool canSpawnProcesses = _configure_resources(procState, routes, spawningRequestPtr);
        // If last resources set permits spawning new processes, instantiate
        // "processes" resource and forwarding route+endpoint
        if(canSpawnProcesses) {
            auto it = _gRoutesConfig->find("proc-fwd");
            assert(it != _gRoutesConfig->end());
            auto fwdRoutePtr = appCfg.procForwarding
                ? new na64dp::util::http::RegexRoute( it->first
                                , it->second.rxPattern
                                , it->second.groups
                                , it->second.strPattern
                                )
                : nullptr;
            // instantiate and fill routes (resources)
            pr = new ProcessResource( procState
                                    , *srvPtr
                                    , srvCtr
                                    , appCfg.urlPathPrefix
                                    , L
                                    , fwdRoutePtr
                                    , &spawningRequestPtr
                                    //, appCfg.ioBufSize
                                    //, appCfg.maxInMemContentBytes
                                    );
            it = _gRoutesConfig->find("proc");
            assert(it != _gRoutesConfig->end());
            auto procRoute = new na64dp::util::http::RegexRoute( it->first
                                , it->second.rxPattern
                                , it->second.groups
                                , it->second.strPattern
                                );
            routes.push_back({procRoute, pr});
            if( appCfg.procForwarding ) {
                assert(fwdRoutePtr);
                auto procFwdEndpoint = new na64dp::util::http::ProcForawrdingEndpoint(
                        *pr, appCfg.ioBufSize, appCfg.maxInMemContentBytes, L);
                routes.push_back({fwdRoutePtr, procFwdEndpoint});
            }
            // "routes" route, for debug; TODO: steered by app option?
            it = _gRoutesConfig->find("routes");
            assert(it != _gRoutesConfig->end());
            auto routesEP = new na64dp::util::http::RoutesView(routes);
            auto routesRoute = new na64dp::util::http::RegexRoute( it->first
                                , it->second.rxPattern
                                , it->second.groups
                                , it->second.strPattern
                                );
            routes.push_back({routesRoute, routesEP});
        }
        // Run the server
        srvPtr->run(routes);
        // If new server instance is provided by "proc" resource we are in
        // child process, meaning that current server instance must be stopped
        // and substituted with new provided by "proc" resource (otherwise
        // it is just stopped, no matter if we are in child process or parent).
        auto newSrv = pr ? pr->new_server_ptr() : nullptr;
        delete srvPtr;
        srvPtr = newSrv;
    }

    // That's all, folks
    L.info("All done -- exiting normally." );
    log4cpp::Category::shutdown();

    return 0;
}

