#include "sync-http-srv/error.hh"

#include <vector>
#include <cstdarg>

#ifndef SYNC_HTTP_SRV__ERR_STRING_MAXLEN
#   define SYNC_HTTP_SRV__ERR_STRING_MAXLEN 1024
#endif

namespace sync_http_srv {
namespace util {
/// A C++ bastard of printf() function
std::string format(const char *fmt, ...) throw() {
    va_list args;
    va_start(args, fmt);
    std::vector<char> v(SYNC_HTTP_SRV__ERR_STRING_MAXLEN);
    while(true) {
        va_list args2;
        va_copy(args2, args);
        int res = vsnprintf(v.data(), v.size(), fmt, args2);
        if ((res >= 0) && (res < static_cast<int>(v.size()))) {
            va_end(args);
            va_end(args2);
            return std::string(v.data());
        }
        size_t size;
        if (res < 0)
            size = v.size() * 2;
        else
            size = static_cast<size_t>(res) + 1;
        v.clear();
        v.resize(size);
        va_end(args2);
    }
}
}  // namespace ::sync_http_srv::util
}  // namespace sync_http_srv
