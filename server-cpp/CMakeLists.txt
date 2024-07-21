cmake_minimum_required( VERSION 3.19 )
project (sync-http-srv VERSION 0.1 LANGUAGES CXX)
message (STATUS "Building ${CMAKE_PROJECT_NAME} of v${CMAKE_PROJECT_VERSION}")

find_package(yaml-cpp)
find_package(nlohmann_json)

set( sync_http_srv_LIB_SOURCES
     src/error.cc
     src/resource-json.cc
     src/resource-yaml.cc
     src/resource.cc
     src/routes-view.cc
     src/server.cc
     src/logging.cc
     src/staticFilesRoute.cc
     src/uri.cc
     # Built-in resources
     #src/resources/processes.cc
     )
file( GLOB_RECURSE sync_http_srv_HEADERS include/*.h include/*.hh )

set(SYNC_HTTP_SRV_TARGET_NAME ${CMAKE_PROJECT_NAME})
add_library(${SYNC_HTTP_SRV_TARGET_NAME} ${sync_http_srv_LIB_SOURCES})
target_include_directories (${SYNC_HTTP_SRV_TARGET_NAME}
    PUBLIC $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    PUBLIC $<INSTALL_INTERFACE:include/sync-http-srv> )
set_target_properties(${SYNC_HTTP_SRV_TARGET_NAME} PROPERTIES PUBLIC_HEADER "${sync_http_srv_LIB_HEADERS}")
set_target_properties(${SYNC_HTTP_SRV_TARGET_NAME} PROPERTIES VERSION ${CMAKE_PROJECT_VERSION}
                SOVERSION ${CMAKE_PROJECT_VERSION} )


set(SYNC_HTTP_SRV_EXEC trivial-srv)
add_executable(${SYNC_HTTP_SRV_EXEC} main-srv-trivial.cc)
target_link_libraries(${SYNC_HTTP_SRV_EXEC} PUBLIC ${SYNC_HTTP_SRV_TARGET_NAME})
set_target_properties(${SYNC_HTTP_SRV_EXEC} PROPERTIES ENABLE_EXPORTS TRUE )

#
# Turn on various resource types 
if( ${YAML_CPP_FOUND} )
    message (STATUS "yaml-cpp found: ${YAML_CPP_LIBRARIES}")
    target_link_libraries(${SYNC_HTTP_SRV_TARGET_NAME} PUBLIC ${YAML_CPP_LIBRARIES})
    target_compile_definitions(${SYNC_HTTP_SRV_TARGET_NAME} PUBLIC SYNC_HTTP_SRV_ENABLE_YAML_RESOURCES=1)
endif( ${YAML_CPP_FOUND} )

if( ${NLOHMANN_JSON_FOUND} )
    message (STATUS "nlohman JSON found")
    target_link_libraries(${SYNC_HTTP_SRV_TARGET_NAME} PUBLIC nlohmann_json::nlohmann_json)
    target_compile_definitions(${SYNC_HTTP_SRV_TARGET_NAME} PUBLIC SYNC_HTTP_SRV_ENABLE_JSON_RESOURCES=1)
endif( ${NLOHMANN_JSON_FOUND} )
# ... todo: XML/msgpack/etc?

target_compile_definitions(${SYNC_HTTP_SRV_TARGET_NAME} PRIVATE SYNC_HTTP_SRV_VERSION="${CMAKE_PROJECT_VERSION}")

#include(CMakePackageConfigHelpers)
#configure_file ...
