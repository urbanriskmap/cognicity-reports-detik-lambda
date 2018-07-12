/* eslint-disable require-jsdoc */
'use strict';

const test = require('unit.js');
const DetikDataSource = require('../lib/detik');
const config = require('../config.js');

const pool = {};

// Create server with empty objects
// We will mock these objects as required for each test suite
const detikDataSource = new DetikDataSource(
    config,
    pool
);

// Test harness for CognicityReportsPowertrack object
describe( 'DetikDataSource', function() {
    describe( 'start', function() {
        let oldPoll;
        let pollCalledTimes;

        before( function() {
            oldPoll = detikDataSource._poll;
            detikDataSource.
                _updateLastContributionIdFromDatabase = function() {};
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

    describe( '_fetchResults', function() {
        let oldHttps;
        let oldFilterResults;
        let oldUpdateLastContributionIdFromBatch;

        let dataCallback;
        let endCallback;
        let errorCallback;

        let httpsData;

        let filterResultsCalled;
        let filterResultsReturnTrueOnce;
        let generateRequestError;
        let updateLastContributionIdFromBatchCalled;

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

            oldUpdateLastContributionIdFromBatch =
                detikDataSource._updateLastContributionIdFromBatch;
            detikDataSource._updateLastContributionIdFromBatch = function() {
                updateLastContributionIdFromBatchCalled = true;
            };
        });

        beforeEach( function() {
            filterResultsCalled = 0;
            filterResultsReturnTrueOnce = false;
            generateRequestError = false;
            updateLastContributionIdFromBatchCalled = false;
        });

        it( 'No results returned stops processing', function() {
            httpsData = '{"result":[]}';
            detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 0 );
            test.value( updateLastContributionIdFromBatchCalled ).is( true );
        });

        it( 'Invalid result object returned stops processing', function() {
            httpsData = '{invalid-json}';
            detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 0 );
            test.value( updateLastContributionIdFromBatchCalled ).is( true );
        });

        it( 'Valid result calls _filterResults', function() {
            httpsData = '{"result":[{}]}';
            detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 1 );
            test.value( updateLastContributionIdFromBatchCalled ).is( false );
        });

        it( 'Request error stops processing', function() {
            httpsData = '{"result":[{}]}';
            generateRequestError = true;
            detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 0 );
            test.value( updateLastContributionIdFromBatchCalled ).is( true );
        });

        it( 'Multiple pages recurses', function() {
            httpsData = '{"result":[{}]}';
            filterResultsReturnTrueOnce = true;
            detikDataSource._fetchResults();
            test.value( filterResultsCalled ).is( 2 );
            test.value( updateLastContributionIdFromBatchCalled ).is( false );
        });

        // Restore/erase mocked functions
        after( function() {
            detikDataSource.https = oldHttps;
            detikDataSource._filterResults = oldFilterResults;
            detikDataSource._updateLastContributionIdFromBatch =
                oldUpdateLastContributionIdFromBatch;
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
            detikDataSource._lastContributionId = 0;
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

        it( 'Last processed ID is updated from one batch', function() {
            detikDataSource.config.HISTORICAL_LOAD_PERIOD = 60000;
            let results = [];
            results.push( generateResult(1, new Date().getTime()) );
            results.push( generateResult(2, new Date().getTime()-120000) );
            test.value( detikDataSource._lastContributionId ).is( 0 );
            detikDataSource._filterResults(results);
            test.value( detikDataSource._lastContributionId ).is( 1 );
        });

        it( `Last processed ID is not updated from one batch with no 
            filtered result`, function() {
            detikDataSource.config.HISTORICAL_LOAD_PERIOD = 60000;
            let results = [];
            results.push( generateResult(1, new Date().getTime()) );
            results.push( generateResult(2, new Date().getTime()) );
            detikDataSource._filterResults(results);
            test.value( detikDataSource._lastContributionId ).is( 0 );
        });

        it('Last processed ID is updated during last batch of two', function() {
            detikDataSource.config.HISTORICAL_LOAD_PERIOD = 60000;
            let results = [];
            results.push( generateResult(1, new Date().getTime()) );
            results.push( generateResult(2, new Date().getTime()) );
            detikDataSource._filterResults(results);
            test.value( detikDataSource._lastContributionId ).is( 0 );
            results = [];
            results.push( generateResult(3, new Date().getTime()) );
            results.push( generateResult(4, new Date().getTime()-120000) );
            detikDataSource._filterResults(results);
            test.value( detikDataSource._lastContributionId ).is( 3 );
        });

        // Last contribution ID is only updated when our batch of pages
        // is finished
        // - so either by filterResults() stopping processing, or
        // - or by fetchResults() getting to the end of the batch
        // This case - all successes in filterResults() - will not
        // update lastContributionId
        it( `Last processed ID is not updated during last batch of two with no 
            filtered result`, function() {
            detikDataSource.config.HISTORICAL_LOAD_PERIOD = 60000;
            let results = [];
            results.push( generateResult(1, new Date().getTime()) );
            results.push( generateResult(2, new Date().getTime()) );
            detikDataSource._filterResults(results);
            test.value( detikDataSource._lastContributionId ).is( 0 );
            results = [];
            results.push( generateResult(3, new Date().getTime()) );
            results.push( generateResult(4, new Date().getTime()) );
            detikDataSource._filterResults(results);
            test.value( detikDataSource._lastContributionId ).is( 0 );
        });

        // Restore/erase mocked functions
        after( function() {
            detikDataSource.config = {};
        });
    });
});
