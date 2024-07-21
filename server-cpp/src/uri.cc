#include "sync-http-srv/uri.hh"

#include <wordexp.h>
#include <regex>
#include <vector>

namespace sync_http_srv {
namespace errors {
InvalidURI::InvalidURI(const char * es) throw() : GenericRuntimeError(es) {}
}  // namespace ::sync_http_srv::errors
namespace util {

std::unordered_multimap<std::string, std::string>
URI::parse_query_string( const std::string & str
                       , const std::string & rxS
                       ) {
    std::regex rx(rxS);
    std::unordered_multimap<std::string, std::string> result;
    if(str.empty()) return result;
    auto const vec = std::vector<std::string>(
            std::sregex_token_iterator{begin(str), end(str), rx, -1},
            std::sregex_token_iterator{}
        );
    for(auto entry : vec) {
        size_t nEq = entry.find('=');
        if(std::string::npos != nEq)
            result.emplace( entry.substr(0, nEq), entry.substr(nEq+1) );
        else
            result.emplace( entry, "");
    }
    return result;
}

void
URI::scheme(const std::string & scheme_) {
    _scheme = scheme_;
}

void
URI::port(const std::string & strPortNo) {
    // TODO: check only int
    _port = strPortNo;
}

void
URI::port(uint16_t portNo) {
    _port = std::to_string(portNo);
}

void
URI::host(const std::string & host_) {
    _host = host_;
}

void
URI::path(const std::string & path_) {
    // TODO: check validity
    _path = path_;
}

//
// URI and related

//static const std::string _2encode = " !\"#$%&'()*+,/:;=?@[]";

std::string
URI::encode(const std::string & s) {
    std::string encoded;
    encoded.reserve(s.size());
    for(const char * c = s.c_str(); *c != '\0'; ++c) {
        if( isalnum(*c)
         || *c == '-'
         || *c == '_'
         || *c == '.'
         || *c == '~' ) {
            encoded += *c;
            continue;
        } else {
            char bf[8];
            snprintf(bf, sizeof(bf), "%02X", (int) *c);
            encoded += '%';
            encoded += bf;
        }
    }
    return encoded;
}

std::string
URI::decode(const std::string & s) {
    std::string decoded;
    decoded.reserve(s.size());
    for(const char * c = s.c_str(); '\0' != *c; ++c) {
        if(*c != '%') {
            if('+' != *c)
                decoded += *c;
            else
                decoded += ' ';
        } else {
            if(c[1] == '\0' || c[2] == '\0') {
                throw std::runtime_error("Bad string to decode (%%-encoding truncated)");
            }
            int code;
            char pbf[] = { c[1], c[2], '\0' };
            sscanf(pbf, "%02X", &code);
            if(code > 0xff) {
                throw std::runtime_error("Could not url-decode code large"
                        " number (extended set?)");
            }
            decoded += (char) code;
            c += 2;
        }
    }
    return decoded;
}

// See: https://www.rfc-editor.org/rfc/rfc3986#appendix-B
const std::regex rxURI(
        R"~(^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?)~");
//           12            3  4          5       6  7        8 9

URI::URI(const std::string & strUri) {
    std::smatch m;
    if(!std::regex_match(strUri, m, rxURI)) {
        char errBf[128];
        snprintf( errBf, sizeof(errBf)
                , "String does not match URI format: \"%s\""
                , strUri.c_str() );
        throw errors::InvalidURI(errBf);
    }

    std::vector<std::string> groups(m.begin(), m.end());

    _scheme   = groups[2];
    //_host     = groups[4];
    _path     = groups[5];
    _qParams  = parse_query_string(groups[7]);
    _fragment = groups[9];

    std::string authority = groups[4];
    if(!authority.empty()) {
        size_t n = authority.find('@');
        if(n != std::string::npos) {
            _userinfo = authority.substr(0, n);
        }
        if(n == std::string::npos) n = 0; else ++n;
        size_t nn = authority.find(':', n);
        if(nn != std::string::npos) {
            _host = authority.substr(n, nn - n );
            _port = authority.substr(++nn);
        } else {
            _host = authority.substr(n);
        }
    }

    #if 0  // might be helpful in debug
    std::cout << "    scheme: \"" << _scheme << "\"" << std::endl
              << " authority: \"" << authority << "\"" << std::endl
              << "          userinfo: \"" << _userinfo << "\"" << std::endl
              << "              host: \"" << _host << "\"" << std::endl
              << "              port: \"" << _port << "\"" << std::endl
              << "      path: \"" << _path << "\"" << std::endl
              << "     query: \"" << _query << "\"" << std::endl
              << "  fragment: \"" << _fragment << "\"" << std::endl
              ;
    #endif
}

std::string
URI::authority() const {
    std::ostringstream oss;
    if( !_userinfo.empty() ) oss << _userinfo << '@';
    oss << ( _host.empty()
           ? ((_port.empty() && _userinfo.empty()) ? "" : "localhost")
           : _host
           );
    if( !_port.empty()) oss << ':' << _port;
    return oss.str();
}

std::string
URI::query_str() const {
    std::ostringstream oss;
    bool isFirst = true;
    for(auto entry : _qParams) {
        if(isFirst) isFirst = false; else oss << "&";
        oss << entry.first << "=" << entry.second;
    }
    return oss.str();
}

std::string
URI::to_str(bool noCheck) const {
    std::ostringstream oss;

    if(!_scheme.empty()) oss << _scheme << ':';
    std::string auth = authority();
    if(!auth.empty()) {
        oss << "//" << authority();
    }
    if(!_path.empty()) oss << _path;
    if(!_qParams.empty()) oss << '?' << query_str();
    if(!_fragment.empty()) oss << '#' << _fragment;

    std::string s = oss.str();
    if(!noCheck) {
        if(!std::regex_match(s, rxURI)) {
            char errBf[128];
            snprintf( errBf, sizeof(errBf)
                    , "Incomplete URI: \"%s\""
                    , s.c_str() );
            throw errors::InvalidURI(errBf);
        }
    }
    return s;
}

}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv
