/* eslint-disable require-jsdoc */
/* eslint-disable no-useless-escape */
'use strict';

const test = require('unit.js');
const DetikDataSource = require('../lib/detik');
const config = require('../config.js');

// Create server with empty objects
// We will mock these objects as required for each test suite
const detikDataSource = new DetikDataSource(
    config
);

// Test harness for CognicityReportsPowertrack object
describe( 'DetikDataSource', function() {
    it('Can create instance', function() {
        const instance = new DetikDataSource(
            config,
        );
        test.value(instance).isInstanceOf(DetikDataSource);
    });

    describe( 'start', function() {
        let oldPoll;
        let pollCalledTimes;

        before( function() {
            oldPoll = detikDataSource._poll;
            detikDataSource._poll = function() {
                pollCalledTimes++;
            };
        });

        beforeEach( function() {
            pollCalledTimes = 0;
        });

        it( 'Poll called immediately at start', function() {
            detikDataSource.start();
            test.value( pollCalledTimes ).is( 1 );
        });

        // Restore/erase mocked functions
        after( function() {
            detikDataSource._poll = oldPoll;
        });
    });

    describe('_poll()', function() {
        let oldFetchResults = detikDataSource._fetchResults;

        before(function() {
            detikDataSource._fetchResults = function() {
            return 0;
            };
        });

        it('Poll is executed', function() {
            detikDataSource._poll();
        });

        after(function() {
            detikDataSource._fetchResults = oldFetchResults;
        });
    });

    describe('processResult()', function() {
        let oldSaveResult = detikDataSource._saveResult;

        before(function() {
            detikDataSource._saveResult = function() {
            return 0;
            };
        });

        it('processResult is executed', function() {
            detikDataSource._processResult({});
        });

        after(function() {
            detikDataSource._saveResult = oldSaveResult;
        });
    });

    describe('_saveResult()', function() {
        let oldPostConfirmed = detikDataSource._postConfirmed;
        let resultStore;

        before(function() {
            detikDataSource._postConfirmed = function(result) {
                resultStore = result;
            };
        });

        const data = {
            location: {
                geospatial: {
                    longitude: 1,
                    latitude: 1,
                },
            },
        };

        const nullIsland = {
            location: {
                geospatial: {
                    longitude: 0,
                    latitude: 0,
                },
            },
        };

        it('Catches null island', function() {
            detikDataSource._saveResult(nullIsland);
            test.value(resultStore).is(undefined);
        });

        it('processResult is executed', function() {
            detikDataSource._saveResult(data);
            test.value(resultStore).is(data);
        });

        after(function() {
            detikDataSource._postConfirmed = oldPostConfirmed;
        });
    });


    describe( '_fetchResults', function() {
        let oldHttps;
        let oldFilterResults;

        let dataCallback;
        let endCallback;
        let errorCallback;

        let httpsData;

        let filterResultsCalled;
        let filterResultsReturnTrueOnce;
        let generateRequestError;

        before( function() {
            oldHttps = detikDataSource.https;
            detikDataSource.https = {
                request: function(url, callback) {
                    let res = {
                        setEncoding: function() {},
                        on: function(event, callback) {
                            if (event==='data') dataCallback = callback;
                            if (event==='end') endCallback = callback;
                        },
                    };
                    callback(res);

                    let req = {
                        on: function(event, callback) {
                            if (event==='error') errorCallback = callback;
                        },
                        end: function() {
                            if (generateRequestError) {
                                errorCallback({message: 'foo', stack: 'bar'});
                            } else {
                                dataCallback(httpsData);
                                endCallback();
                            }
                        },
                    };
                    return req;
                },
            };

            oldFilterResults = detikDataSource._filterResults;
            detikDataSource._filterResults = function() {
                filterResultsCalled++;
                if (filterResultsReturnTrueOnce) {
                    filterResultsReturnTrueOnce = false;
                    return true;
                } else {
                    return false;
                }
            };
        });

        beforeEach( function() {
            filterResultsCalled = 0;
            filterResultsReturnTrueOnce = false;
            generateRequestError = false;
        });

        it( 'No results returned stops processing', async function() {
            httpsData = '{"result":[]}';
            await detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 0 );
        });

        it( 'Invalid result object returned stops processing',
        async function() {
            httpsData = '{invalid-json}';
            await detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 0 );
        });

        it( 'Valid result calls _filterResults', async function() {
            httpsData = '{"result":[{}]}';
            await detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 1 );
        });

        it( 'Request error stops processing', async function() {
            httpsData = '{"result":[{}]}';
            generateRequestError = true;
            await detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 0 );
        });

        it( 'Multiple pages recurses', async function() {
            httpsData = '{"result":[{}]}';
            filterResultsReturnTrueOnce = true;
            await detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 2 );
        });

        // Restore/erase mocked functions
        after( function() {
            detikDataSource.https = oldHttps;
            detikDataSource._filterResults = oldFilterResults;
        });
    });

    describe( '_filterResults', function() {
        let processedResults = [];

        function generateResult( contributionId, date ) {
            return {
                contributionId: contributionId,
                date: {
                    update: {
                        sec: date / 1000,
                    },
                },
            };
        }

        before( function() {
            detikDataSource._processResult = function(result) {
                processedResults.push(result);
            };
        });

        beforeEach( function() {
            processedResults = [];
            detikDataSource.config.HISTORICAL_LOAD_PERIOD =
                new Date().getTime() + 60000;
        });

        it( 'New result is processed', function() {
            let results = [];
            test.value( processedResults.length ).is( 0 );
            results.push( generateResult(1, 1) );
            detikDataSource._filterResults(results);
            test.value( processedResults.length ).is( 1 );
        });

        it( 'Already processed result is not processed', function() {
            let results = [];
            results.push( generateResult(1, 1) );
            detikDataSource._filterResults(results);
            detikDataSource._filterResults(results);
            test.value( processedResults.length ).is( 1 );
        });

        it( 'Result older than cutoff is not processed', function() {
            detikDataSource.config.HISTORICAL_LOAD_PERIOD = 0;
            let results = [];
            results.push( generateResult(1, 1) );
            detikDataSource._filterResults(results);
            test.value( processedResults.length ).is( 0 );
        });

        // Restore/erase mocked functions
        after( function() {
            detikDataSource.config = {};
        });
    });

    describe('_insertConfirmed', function() {
        let detikReport = {
            files: {photo: 'https://photo.com'},
            url: 'https:\//web.com',
            contributionId: 1,
            content: 'report',
            title: 'title',
            location: {
                geospatial: {
                    longitude: 1,
                    latitude: 1,
                },
            },
            date: {
                create: {
                    sec: 1000,
                },
            },
            user: {
                creator: {
                    id: 123,
                },
            },
        };

        let postProcessedReport = {
        files: {
            photo: 'https://photo.com',
            },
        url: 'https://web.com',
        contributionId: 1,
        content: 'report',
        title: 'title',
        location: {
            geospatial: {
                longitude: 1,
                latitude: 1,
                },
            },
        user: {
            creator: {
                id: 123,
                },
            },
        lang: 'id',
        disaster_type: 'flood',
        date: {
            create: {
                sec: 1000,
            },
            },
        };

        it( `Processes report with photo`, async function() {
            let err; let response = await detikDataSource.
                _postConfirmed(detikReport);
            console.log(err, response);
            test.value(response).is(postProcessedReport);
        });

        it( `Processes report without photo`, async function() {
            detikReport.files.photo = null;
            postProcessedReport.files.photo = null;
            let err; let response = await detikDataSource.
                _postConfirmed(detikReport);
            console.log(err, response);
            test.value(response).is(postProcessedReport);
        });

        it( `Catches bad input`, async function() {
            detikDataSource._postConfirmed({});
        });
    });
});
