#pragma once

#include "sync-http-srv/error.hh"

#include <string>
#include <unordered_map>
#include <regex>

namespace sync_http_srv {
namespace errors {
class InvalidURI : public GenericRuntimeError {
public:
    InvalidURI(const char *) throw();
};
}  // namespace ::sync_http_srv::errors
namespace util {

/// Global const -- regular expression used to validate and parse URI
extern const std::regex rxURI;

/// A parsed URI identifier representation
///
/// \todo custom regex-based representation
class URI {
public:
    /// Performs "URL-encoding" (note: space is numeric)
    static std::string encode(const std::string &);
    /// Performs "URL-decoding" (note plus interpreted as space)
    static std::string decode(const std::string &);

    /// A simple query string parser
    static std::unordered_multimap<std::string, std::string>
    parse_query_string(const std::string &, const std::string & delimRx=R"(&)");
private:
    std::string _scheme
              , _userinfo
              , _host
              , _port
              , _path
              //, _query
              , _fragment
              ;
    std::unordered_multimap<std::string, std::string> _qParams;
public:
    URI() = default;
    URI(const std::string & uri);
    ~URI() = default;

    const std::string & scheme() const { return _scheme; }
    const std::string & userinfo() const { return _userinfo; }
    const std::string & host() const { return _host; }
    const std::string & port() const { return _port; }
    const std::string & path() const { return _path; }
    std::string query_str() const;
    const std::unordered_multimap<std::string, std::string> & query() const {return _qParams;}
    std::unordered_multimap<std::string, std::string> & query() {return _qParams;}
    const std::string & fragment() const { return _fragment; }

    std::string authority() const;

    void scheme(const std::string & v);
    void host(const std::string &);
    void port(const std::string &);
    void port(uint16_t);
    void path(const std::string &);
    //void query(const std::string &);
    void fragment(const std::string &);

    bool is_valid() const;
    std::string to_str(bool noCheck=false) const;
};

}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv

