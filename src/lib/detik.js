'use strict';

/**
 * The Detik data source.
 * Poll the Detik feed for new data and send it to the reports application.
 * @constructor
 * @param {object} config Detik configuration
 */
let DetikDataSource = function DetikDataSource(
        config
    ) {
    // Store references to config and pool
    this.config = config;

    this.https = require('https');

    // Set constructor reference (used to print the name of this data source)
    this.constructor = DetikDataSource;
};

DetikDataSource.prototype = {

    /**
     * Data source configuration.
     * This contains the data source specific configuration.
     * @type {object}
     */
    config: {},

    /**
     * Instance of node https.
     */
    https: null,

    /**
     * Polling worker function.
     * Poll the Detik web service and process the results.
     * This method is called repeatedly on a timer.
     */
    _poll: async function() {
        let self = this;

        try {
            // Begin processing results from page 1 of data
            let page = 1;
            let result = await self._fetchResults();
            
            while (result === true) {
                page++;
                result = await self._fetchResults();
            }
        } catch (err) {
            console.log(err);
        }
    },

    /**
     * Fetch one page of results
     * Call the callback function on the results
     * Recurse and call self to fetch the next page of results if required
     * @param {number} page Page number of results to fetch, defaults to 1
     * @return {promise} Result of processing
     */
    _fetchResults: function( page ) {
        return new Promise((resolve, reject) => {
            let self = this;
            if (!page) page = 1;
            console.log( 'DetikDataSource > poll > fetchResults: Loading page '+
            page );

            let requestURL = self.config.DETIK_URL + '&page=' + page;
            let response = '';

            let req = self.https.request( requestURL, function(res) {
              console.log('making request');
              res.setEncoding('utf8');

              res.on('data', function(chunk) {
                response += chunk;
              });

              res.on('end', function() {
                console.log('response ended');
                let responseObject;
                try {
                    responseObject = JSON.parse( response );
                } catch (e) {
                    console.log( `DetikDataSource > poll > fetchResults: 
                        Error parsing JSON: ` + response );
                    reject(new Error(`DetikDataSource > poll > fetchResults: 
                    Error parsing JSON: ` + response));
                }

                console.log('DetikDataSource > poll > fetchResults: Page ' +
                    page + ' fetched, ' + response.length + ' bytes');

                console.log(responseObject.result.length);
                if ( !responseObject || !responseObject.result ||
                    responseObject.result.length === 0 ) {
                    // If page has a problem or 0 objects, end
                    console.log( `DetikDataSource > poll > fetchResults: 
                    No results found on page ` + page );
                    reject(`DetikDataSource > poll > fetchResults: No results 
                    found on page ` + page );
                } else {
                    try {
                        // Run data processing callback on the result objects
                        if ( self._filterResults(responseObject.result)) {
                            console.log('inside');
                            // If callback returned true, processing should
                            // continue on next page
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } catch (err) {
                        reject(err);
                    }
                }
              });
            });
            req.on('error', function(error) {
                console.log( `DetikDataSource > poll > fetchResults: 
                Error fetching page ` + page + ', ' + error.message + ', ' +
                error.stack );
                reject(new Error(`DetikDataSource > poll > fetchResults: 
                Error fetching page ` + page + ', ' + error.message + ', ' +
                error.stack ));
            });
            req.end();
        });
    },

    /**
     * Process the passed result objects
     * Stop processing if we've seen result before, or if the result is too old
     * @param {Array} results Array of result objects from Detik data to process
     */
    _filterResults: function( results ) {
        let self = this;

        // For each result:
        let result = results.shift();
        while ( result ) {
            if ( result.date.update.sec * 1000 < new Date().getTime() -
                self.config.HISTORICAL_LOAD_PERIOD ) {
                // This result is older than our cutoff, stop processing
                // TODO What date to use? transform to readable. timezone
                console.log( 'DetikDataSource > poll > processResults: ' +
                `Result ` + result.contributionId +
                ' older than maximum configured age of ' +
                self.config.HISTORICAL_LOAD_PERIOD / 1000 + ' seconds' );
                break;
            } else {
                // Process this result
                console.log( `DetikDataSource > poll > processResults: 
                Processing result ` + result.contributionId );
                self._processResult( result );
            }
            result = results.shift();
        }
    },
    /**
     * Process a result.
     * This method is called for each new result we fetch from the web service.
     * @param {object} result The result object from the web service
     */
    _processResult: function( result ) {
        let self = this;
        // Process result now
        self._saveResult(result);
    },

    /**
     * Save a result to cognicity server.
     * @param {object} result The result object from the web service
     */
    _saveResult: function( result ) {
         let self = this;

         // Detik doesn't allow users from the Gulf of Guinea
         // (indicates no geo available)
         if (result.location.geospatial.longitude !== 0 &&
            result.location.geospatial.latitude !== 0) {
             self._postConfirmed(result);
         }
    },

    /**
     * Insert a confirmed report - i.e. has geo coordinates
     * Store both the detik report and the user hash
     * @param {detikReport} detikReport Detik report object
     * @return {string} - Query parameters for debugging
     */
    _postConfirmed: function( detikReport ) {
            try {
                // Check for photo URL and fix escaping slashes
                if (!detikReport.files.photo) {
                    detikReport.files.photo = null;
                } else {
                    detikReport.files.photo =
                        detikReport.files.photo.replace('\'\'', '');
                }

                // Fix language code for this data type
                detikReport.lang = 'id';

                // Fix escaping slashes or report URL
                detikReport.url = detikReport.url.replace('\'\'', '');

                // Add disaster type
                detikReport.disaster_type = 'flood';

                // print this out as a proxy for http call.
                console.log(detikReport);
                return (null, detikReport);
            } catch (err) {
                console.log('Error processing Detik data.', err.message);
                return (new Error('Error processing Detik data. ' +
                    err.message));
            }
    },

    /**
     * Start fetching Detik reports.
     * Setup polling and start fetching reports from the Detik feed.
     */
    start: function() {
        let self = this;

        // Called on interval to poll data source
        /* let poll = function() {
            console.log( 'DetikDataSource > start: Polling ' +
            self.config.DETIK_URL );
            self._poll();
        };

        // Poll now, immediately
        poll();*/
        self._poll();
    },

};

// Export the PowertrackDataSource constructor
module.exports = DetikDataSource;
