#pragma once

#include <stdexcept>

namespace sync_http_srv {
namespace util {
/**\brief A C++ bastard of printf() function
 *
 * This function reproduces pure C `printf()` behaviour, accepting a format
 * string and arbitrary number of arguments to produce output as an
 * `std::string` instance.
 *
 * Although the output string is allocated on heap, initial buffer is restrcted
 * by number defined by `NA64DP_STR_FMT_LENGTH` macro. It will be extended, but
 * this fact may have importance for performance concerns.
 * */
std::string format(const char *fmt, ...) throw();
}  // namespace ::sync_http_srv::util
namespace errors {
class GenericRuntimeError : public std::runtime_error {
public:
    GenericRuntimeError(const char * s) throw()
        : std::runtime_error(s)
        {}
};
}  // namespace ::sync_http_srv::errors
}  // namespace sync_http_srv
