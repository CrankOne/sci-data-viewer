#include "sync-http-srv/staticFilesRoute.hh"

#if 0
#include <dirent.h>
#include <filesystem>

namespace na64dp {
namespace util {
namespace http {

// Added some common MIME types for static file share. This is a subset of the
// official table:
//      https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
static const struct { char extension[8], contentType[32]; } _gContentTypes[] = {
    { "html",   "text/html" },
    { "htm",    "text/html" },
    { "ico",    "image/vnd.microsoft.icon" },
    { "css",    "text/css" },
    { "js",     "text/javascript"  },
    { "json",   "application/json" },
    { "bz",     "application/x-bzip" },
    { "bz2",    "application/x-bzip2" },
    { "zip",    "application/zip" },
    { "csv",    "text/csv" },
    { "gif",    "image/gif" },
    { "jpg",    "image/jpeg" },
    { "jpeg",   "image/jpeg" },
    { "png",    "image/png" },
    { "pdf",    "application/pdf" },
    { "svg",    "image/svg+xml" },
    { "txt",    "text/plain" },
    { "xml",    "application/xml" },
    { "yml",    "text/x-yaml" },
    { "yaml",   "text/x-yaml" },
    // ...
    { "", "" }
};

LocalDirRoute::LocalDirRoute( const std::string & localPath_
                            , const std::string & urlPrefix
                            , bool defaultContentTypes
                            )
        : _localPath(std::filesystem::canonical(expand_name(localPath_)))
        , _urlPath(urlPrefix)
        {
    // check if dir exists
    DIR * dirPtr = opendir(_localPath.c_str());
    if(!dirPtr) {
        int en = errno;
        char errBf[128];
        if(en == ENOENT) {
            snprintf( errBf, sizeof(errBf)
                    , "No such dir: \"%s\" (\"%s\")"
                    , _localPath.c_str(), localPath_.c_str() );
            throw std::runtime_error(errBf);
        }
        snprintf(errBf, sizeof(errBf), "Dir open error: %s", strerror(en));
        throw std::runtime_error(errBf);
    }
    closedir(dirPtr);  // ok

    if(defaultContentTypes) {
        for(auto * ptr = _gContentTypes; '\0' != ptr->extension[0]; ++ptr) {
            _contentTypes.emplace(ptr->extension, ptr->contentType);
        }
    }
}

void
LocalDirRoute::add_file_type( const std::string & extension
                            , const std::string &contentType ) {
    _contentTypes.emplace(extension, contentType);
}

Server::HandleResult
LocalDirRoute::try_handle(std::shared_ptr<RequestMsg> rq, int) {
    Server::HandleResult result = {0x0, nullptr};
    size_t n = rq->uri().path().find(_urlPath);
    if(n != 0) return result;  // path doesn't match
    n += _urlPath.size()+1;

    std::filesystem::path absPath(_localPath);
    absPath += rq->uri().path().substr(n);
    absPath = std::filesystem::canonical(absPath);

    // Make sure we're not access parent dirs
    // TODO: seems not being too reliable actually.
    {
        // Get relative path for file enitity
        auto relPath = std::filesystem::relative(absPath, _localPath);
        if(std::string(relPath).find("..") != std::string::npos) {
            result.second = std::make_shared<ResponseMsg>(Msg::Forbidden);
            //result.second->content("{\"errors\":[\"Access forbidden\"]}");  // TODO
            return result;
        }
    }
    // Check file exists
    if(!std::filesystem::exists(absPath)) {
        result.second = std::make_shared<ResponseMsg>(Msg::NotFound);
        //result.second->content("{\"errors\":[\"Not found.\"]}");  // TODO
        return result;
    }

    // Assume file content type by extensions
    std::string extension = absPath.extension();
    auto ctIt = _contentTypes.find(extension);
    if(extension.empty() || ctIt == _contentTypes.end()) {
        result.second->set_header("Content-Type", "application/octet-stream");
    } else {
        result.second->set_header("Content-Type", ctIt->second);
    }

    //result.second->set_file_payload(absPath);
    throw std::runtime_error("TODO");

    return result;
}

}  // namespace ::na64dp::util::http
}  // namespace ::na64dp::util
}  // namespace na64dp
#endif
