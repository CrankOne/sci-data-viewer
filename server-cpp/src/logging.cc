#include "sync-http-srv/logging.hh"

#include <iostream>

namespace sync_http_srv {

bool ConsolePrintJournal::debug_enabled() const {
    return true;
}

void ConsolePrintJournal::debug(const char * msg) {
    std::cout << msg << std::endl;
}

void ConsolePrintJournal::info(const char * msg) {
    std::cout << msg << std::endl;
}

void ConsolePrintJournal::warn(const char * msg) {
    std::cout << msg << std::endl;
}

void ConsolePrintJournal::error(const char * msg) {
    std::cout << msg << std::endl;
}

}  // namespace sync_http_srv

