#pragma once

#if 0
#include "na64util/http/server.hh"

namespace na64dp {
namespace util {
namespace http {

///\brief Local file content
class LocalFileContent : public Msg::iContent {
protected:
    std::string _filePath;
    size_t _fileSize;
public:
    LocalFileContent(const std::string &);
};

/**\brief Static files route
 *
 * A simple route implementation serving static files from certain local
 * directory.
 *
 * \note This handler is NOT SECURE for general-purpose web as may allow
 * */
class LocalDirRoute : public Server::iRoute {
protected:
    const std::string _localPath
                    , _urlPath
                    ;
    std::unordered_map<std::string, std::string> _contentTypes;
    // TODO: include/exclude patterns
public:
    LocalDirRoute( const std::string & localPath
                 , const std::string & urlPath
                 , bool defaultContentTypes=true
                 );
    void add_file_type( const std::string & extension
                      , const std::string & contentType );
    Server::HandleResult try_handle( std::shared_ptr<RequestMsg>, int ) override;
};

}  // namespace ::na64dp::util::http
}  // namespace ::na64dp::util
}  // namespace na64dp
#endif
