#pragma once

namespace sync_http_srv {

class iJournal {
public:
    virtual bool debug_enabled() const = 0;
    virtual void debug(const char *) = 0;
    virtual void info(const char *) = 0;
    virtual void warn(const char *) = 0;
    virtual void error(const char *) = 0;
};

/// A simplest possible implementation of logger
///
/// Forwards informative (debug and info) messages to cout, warnings and errors
/// to cerr. Adds newlines to messages.
class ConsolePrintJournal : public iJournal {
public:
    bool debug_enabled() const override;
    void debug(const char *) override;
    void info(const char *) override;
    void warn(const char *) override;
    void error(const char *) override;
};

};

