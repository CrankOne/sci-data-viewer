#include <iostream>
#include <fstream>
#include <memory>

#include "sync-http-srv/logging.hh"
#include "sync-http-srv/server.hh"
namespace web = sync_http_srv::util::http;

// A representation of some simple collection. In real applications, this is
// usually a result of calculus -- a physical event from experimental
// statistics, a frame from the sequence, etc.
// In this example we provide three boxes of same material, just to make sure,
// the simplest C++ endpoint works as expected. One box remains the same,
// another is flipping (existing only for odd numbers of "page"), the third
// box changes its size in a cycle.
struct ExampleSubjectState {
    // this counter gets incrmented each time client sends PATCH request to
    // the endpoint.
    int nPage;
    // this example method generates output, unique to particular `nPage` value
    void to_json(std::ostream &);

    ExampleSubjectState() : nPage(0) {}
};

// Implements some silly scene, just for testing.
void
ExampleSubjectState::to_json(std::ostream & os) {
    os << "{" << std::endl;  // begin of response JSON object
    os << "  \"iterable\": true," << std::endl  // needed to denote that this view is iterable collection
       << "  \"geometryData\": {" << std::endl;  // start of renderable items object
    os << "    \"materials\": [" << std::endl;  // start of materials list (geometryData.materials)
    // --- materials
    os << "      {" << std::endl
       << "        \"_name\": \"dftMeshMaterial\"," << std::endl
       << "        \"_type\": \"MeshBasicMaterial\"," << std::endl
       //
       << "        \"transparent\": true," << std::endl
       << "        \"color\": " << 0xffffaa << std::endl
       << "      }" << std::endl
       ;
    os << "    ],"  << std::endl;  // end of materials list (geometryData.materials)
    os << "    \"geometry\": [" << std::endl;  // start of geometry definitions list (geometryData.geometry)
    // --- geometry
    // this box remains of same size, same material, same rotation, etc
    os << "      {" << std::endl
       << "        \"_name\": \"box1\"," << std::endl
       << "        \"_type\": \"BoxGeometry\"," << std::endl
       << "        \"_material\": \"dftMeshMaterial\"," << std::endl
       //
       << "        \"sizes\": [7.5, 17.5, 1]," << std::endl
       << "        \"position\": [0, 0, -10]," << std::endl
       << "        \"rotation\": [0, 12, 6.5]" << std::endl
       << "      }," << std::endl
       ;
    // this box exists only for odd "pages"
    if(nPage%2) {
        os << "      {" << std::endl
           << "        \"_name\": \"box2\"," << std::endl
           << "        \"_type\": \"BoxGeometry\"," << std::endl
           << "        \"_material\": \"dftMeshMaterial\"," << std::endl
           //
           << "        \"sizes\": [15, 8.3, 0.5]," << std::endl
           << "        \"position\": [0, 0, 10]," << std::endl
           << "        \"rotation\": [-3.4, 0, -4.5]" << std::endl
           << "      }," << std::endl
           ;
    }
    // this box changes Y-size every page
    os << "      {" << std::endl
       << "        \"_name\": \"box3\"," << std::endl
       << "        \"_type\": \"BoxGeometry\"," << std::endl
       << "        \"_material\": \"dftMeshMaterial\"," << std::endl
       //
       << "        \"sizes\": [" << 10 - nPage%5 << ", " << 10 + nPage%10 << ", 0.5]," << std::endl
       << "        \"position\": [0, 0, 0]," << std::endl
       << "        \"rotation\": [0, 0, 0]" << std::endl
       << "      }" << std::endl
       ;
    os << "    ]" << std::endl;  // start of geometry definitions list (geometryData.geometry)
    os << "  }" << std::endl;  // end of renderable items object
    os << "}" << std::endl;  // end of response JSON object
}

// A simple endpoint implementing forward-iterable collection
class ExampleEndpoint : public sync_http_srv::util::http::Server::iEndpoint {
private:
    ExampleSubjectState & _state;
public:
    ExampleEndpoint(ExampleSubjectState & state) : _state(state) {}

    // Handle method supporting only GET and PATCH requests. GET response
    // provides the data of the "current" item, while PATCH will switch
    // process to next iteration.
    web::Server::HandleResult handle( const web::RequestMsg & rqMsg
                , int clientFD
                , const web::Server::iRoute::URLParameters & urlParams
                ) override {
        if(rqMsg.method() == sync_http_srv::util::http::Msg::GET) {
            // prepare response message
            auto resp = std::make_shared<web::ResponseMsg>(web::Msg::Ok);
            resp->set_header("Content-Type", "application/json");
            // set response content
            std::ostringstream oss;
            _state.to_json(oss);
            resp->content(std::make_shared<web::StringContent>(oss.str()));
            // return response
            return {0x0, resp};
        }
        if(rqMsg.method() == sync_http_srv::util::http::Msg::PATCH) {
            auto resp = std::make_shared<web::ResponseMsg>(web::Msg::NoContent);
            // patch suceeded, no response content
            return {0x0, resp};
        }
        auto resp = std::make_shared<web::ResponseMsg>(web::Msg::MethodNotAllowed);
        return {0x0, resp};
    }
};

// flag denoting whether server must be kept running
static bool gDoRunServer = true;

int
main(int argc, char * argv[]) {
    ExampleSubjectState state;  // state to maintain
    ExampleEndpoint ep(state);
    web::StringRoute route("scene", "/scene");

    // list of pairs: {iRoute,iEndpoint}

    web::Server::Routes routes;
    routes.push_back({&route, &ep});
    // ...

    sync_http_srv::ConsolePrintJournal log;
    auto srv = new web::Server( "localhost"  // hostname to bind socket
            , 5500  // port to listen to
            , log  // logger instance in use
            , 4  // backlog (max number of connections to maintain)
            , 60  // timeout
            , 5*1024  // response buffer size
            , 1024*1024  // maximum in-memory content length
            );
    while(gDoRunServer) {
        srv->run(routes);
    }

    return 0;
}

