import axios from 'axios'
//import {Vue} from 'vue'
//import jsYaml from 'js-yaml'

//                  * * *   * * *   * * *

const stateModule = {
    namespaced: true,
    state: () => ({
        // List of choosen endpoints capable to provide events information
        dataSources: Object.create(null),
        // ^^^ this entry is for testing purposes
        // Choosen placements infor source
        //xxx, placementsSource: 'http://localhost:5657/api/proc/evdsp-test/api/geometry/placements/?measurementVectors=yes',
        //eventsDataStrList: [],
        //selectedEventSource: 0,
    }),
    mutations: {
        new_source(state, pl_) {
            console.log(pl_);  // XXX
            // TODO pl must provide:
            //  - name
            //  - endpoint address (url)
            //  - amount of the latest data fetched
            const {name, ...pl} = pl_;
            state.dataSources[name] = pl;
            console.log(`new data source "${name}" -> "${pl.endpoint}" added`);
        },
        remove_data_source(state, pl) {
            //Vue.delete(dataSources, pl.name);  // TODO
        }
        //update_events(state, items) {
        //    state.eventsDataStrList = [...items];
        //}
    },
    getters: {
        //get_endpoint(state, dataSourceName) {
        //    if(!state.dataSources.hasOwnProperty(dataSourceName)) {
        //        console.error(`Requesting data from unknown source "${dataSourceName}", returning empty object.`);
        //        return {};
        //    }
        //}
        //events_urls         : state => state.dataSources.map(e => e[1]),
        //placements_url      : state => state.placementsSource,
        //// returns scores array for every event in form [[eventID, [scores]]...]
        //trackScores (state) {
        //    return state.eventsDataStrList.map(evStr => {
        //            const evData = JSON.parse(evStr);
        //            return [evData.id, evData['$collections'].trackScores];
        //        });
        //},
        //tracks (state) {
        //    return state.eventsDataStrList.map(evStr => {
        //            const evData = JSON.parse(evStr);
        //            return [evData.id, evData['$collections'].tracks];
        //        });
        //},
        //// Returns event's item identified by certain ID
        //get_event_item: (state, getters) => (id_, eventID) => {
        //    const m = id_.match( /\$([^@]+)@(\d+)/ );
        //    if(!m) throw new Error(`ID "${id_}" does not match event's item pattern.`);
        //    const groupID = m[1];
        //    const key = m[2];
        //    if('trackScores' == groupID) {
        //        // find appropriate event
        //        const thisEvScores = getters.trackScores.find(
        //            ([evID, _]) => evID.runNo == eventID.runNo
        //                        && evID.spill == eventID.spill 
        //                        && evID.eventInSpill == eventID.eventInSpill
        //            );
        //        if(!thisEvScores) {
        //            throw new Error(`Could not retrieve "${id_}" score data for` +
        //                ` event ${eventID.runNo}-${eventID.spill}-${eventID.eventInSpill}` +
        //                ` -- no such event.`);
        //        }
        //        if(key >= thisEvScores[1].length) {
        //            throw new Error(`Could not retrieve "${id_}" score data for` +
        //                ` event ${eventID.runNo}-${eventID.spill}-${eventID.eventInSpill}` +
        //                ` -- item index is out of range.`);
        //        }
        //        return thisEvScores[1][parseInt(key)];
        //    } 
        //    // ... other objects (tracks, hits, etc)
        //    else {
        //        throw new Error(`Could not retrieve event item "${id_}" for` +
        //                ` event ${eventID.runNo}-${eventID.spill}-${eventID.eventInSpill}` +
        //                ` -- unknwon collection type.`);
        //    }
        //}
    },
    actions: {
        // This action gets called once new data source is added. It extends
        // list of active sources and runs asynchroneous fetching of the
        // content with view3D/update_geo_data mutation on successfull fetch.
        add_data_source({commit, state}, {name, endpoint}) {
            axios.get(endpoint)
                .then(function (response) {
                    const data = response.data;
                    var accessModel = undefined;
                    var dataSize = null;
                    // Endpoint GET provides description of how ThreeViewer has
                    // to treat its content, according to specification:
                    if( ! data.iterable ) {
                        if( data.expiresIn ) {
                            accessModel = 'staticView';
                        } else {
                            accessModel = 'staticViewWithPeriodicUpdates';
                        }
                        // TODO: assure `total', `items', `pages' are N/A
                    } else {
                        if( data.total ) {
                            // TODO: assure:
                            //  - `_links.find' is set and has "{id}
                            //  - `defaultID' is set
                            if( data.items ) {
                                if( data.pages ) {
                                    accessModel = 'sparseCollectionWithPagination';
                                } else {
                                    accessModel = 'sparseCollection';
                                }
                            } else {
                                accessModel = 'denseCollection';
                                // TODO: assure `pages' is N/A
                            }
                        } else {
                            //if(!data._links) {
                            //    throw new Error(`Data source "${name}" -> ${endpoint}`
                            //        + " does not provide neither \"_links\":true or"
                            //        + " \"iterable\":false properties"
                            //        + " (is this really a data endpoint?)")
                            //}
                            accessModel = 'fwIterableCollection';
                            // TODO: assure `items' and `pages' are N/A
                        }
                    }
                    console.log(`Data source "${name}" -> ${endpoint} has access model ${accessModel}`);
                    if( accessModel == 'staticView'
                     || accessModel == 'staticViewWithPeriodicUpdates'
                     || accessModel == 'fwIterableCollection'
                    ) {
                        // geometry data is already fetched in this case
                        commit('view3D/update_geo_data', {name: name
                                , geoData: data.geometryData}
                                , {root:true}
                            );
                        dataSize = JSON.stringify(data.geometryData).length;
                        // add new data source
                        commit('new_source', {name, endpoint, dataSize
                            , 'accessModel':accessModel});
                    } else {
                        // otherwise, render url
                        const url = data._links.replace( /id/g , data.defaultID);
                        console.log(`TODO: request ${url}`);
                    }
                })
                .catch(function (error) {
                    if (error.response) {
                      // The request was made and the server responded with a status code
                      // that falls out of the range of 2xx
                      console.log(error.response.data);
                      console.log(error.response.status);
                      console.log(error.response.headers);
                    } else if (error.request) {
                      // The request was made but no response was received
                      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                      // http.ClientRequest in node.js
                      console.error(error.request);
                    } else {
                      // Something happened in setting up the request that triggered an Error
                      console.error('Error', error.message);
                    }
                    console.log(error.config);
                })
                // .finally() {...}
                ;
            // TODO: load data here...
            // this is global mutation (root:true) addressed, to the `view3D'
            // namespace.
            //context.commit('view3D/update_geo_data', {name:'one', data:{someData:'some data here'}}, {root:true});
        },
        //load_events(context) {
        //    axios.all(context.getters['events_urls'].map((endpoint) => axios.get(endpoint)))
        //        .then(axios.spread((...eventsDataPls) => {
        //            const eventsDataStrs = eventsDataPls.map(resp => {
        //                    if('x-text/yaml' === resp.headers['content-type']) {
        //                        throw Error('TODO');
        //                        //return JSON.stringify(jsYaml.load(resp.data))
        //                    } else if('application/json' === resp.headers['content-type']) {
        //                        return JSON.stringify(resp.data);
        //                    } else {
        //                        throw new Error(`Unnkown content type for event content: ${resp.headers['content-type']}`);
        //                    }
        //                });
        //            context.commit('update_events', eventsDataStrs);  // (in this module)
        //        }));
        //},
        //next_event(context) {
        //    axios.all(context.getters['events_urls'].map((endpoint) => axios.patch(endpoint
        //        , {'eventID':'next'}) ));
        //    // ^^^ TODO: treat result, warn on errors?
        //},
        //load_geometry(context) {
        //    // TODO: keep ETag, abort commit if not changed
        //    axios.get(context.getters['placements_url'])
        //        .then(response => {
        //            //const payload = jsYaml.load(response.data);
        //            throw Error('TODO');
        //            //context.commit('view3D/update_placements', payload, {root: true});
        //            // ^^^ delegated to state module of na64swEvDsp
        //        });
        //},

        //next_event(context) {
        //    axios.patch( context.getters.worker_addr
        //               , {'queries':[
        //                      {'_type': 'append-static-geometry'}
        //                    , {'_type': 'append-track-scores'}
        //                    //, {'_type': 'get-event-id'},
        //                    //, {'_type': 'get-run-info'},
        //                    , {'_type': 'PROCESS-EVENTS'}
        //                    ]
        //                 })
        //        .then( resp => {
        //            console.log('recieved PATCH response from worker:', resp);  // XXX
        //            // NOTE: these updates invokes mutations of ANOTHER state
        //            // module (this calls should be addressed to root state)
        //            if( 'staticGeometry' in resp.data && resp.data.staticGeometry ) {
        //                context.commit('update_static_geometry', resp.data.staticGeometry );
        //            }
        //            if( 'dynamicGeometry' in resp.data && resp.data.dynamicGeometry ) {
        //                context.commit('update_dynamic_geometry', resp.data.dynamicGeometry );
        //            }
        //            // ... (other commits to state with respect to event's new
        //            // data).
        //        } );
        //},
        //update_processes_info(context) {
        //    // init requests for all the processes owned by middleware instance
        //    const rootProcs   = axios.get(context.getters.rootprocs_addr);
        //    //const sourceProcs = axios.get(context.getters.bsrcs_addr);
        //    //const workerProcs = axios.get(context.getters.workers_addr);
        //    // fetch all, do the update on state
        //    axios.all([rootProcs/*, sourceProcs, workerProcs*/])
        //        .then(axios.spread((...resps) => {
        //            const rootsInfo   = resps[0];
        //            //const bsrcsInfo   = resps[1];
        //            //const workersInfo = resps[2];
        //            //console.log(rootsInfo);
        //            
        //            // Request status for every process
        //            const rootProcsRqs = rootsInfo.data.rootProcesses.map(
        //                rootID => axios.get(`http://${context.state.middlewareServer}/api/v0/root/` + rootID));
        //            //const bsrcProcsRqs = bsrcsInfo.data.rootProcesses.map(
        //            //    bsrcID => axios.get(`http://${state.middlewareServer}/api/v0/data-source/${bsrcID}`));
        //            //const workerProcsRqs = workersInfo.data.rootProcesses.map(
        //            //    workerID => axios.get(`http://${state.middlewareServer}/api/v0/worker/${workerID}`));
        //            //return {'roots': resps[0], 'srcs': resps[1], 'workers': resps[2]};
        //            return Promise.all(rootProcsRqs);
        //        }))
        //        .then((procDetails) => {
        //            context.state.commit('update_processes', procDetails);
        //        })
        //        .catch(errors => {
        //            // TODO: properly report on error
        //            console.log(errors);
        //        });
        //}
    }
};

export {stateModule}


