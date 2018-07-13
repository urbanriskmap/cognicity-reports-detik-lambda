'use strict';

/**
 * The Detik data source.
 * Poll the Detik feed for new data and send it to the reports application.
 * @constructor
 * @param {object} config Detik configuration
 * @param {object} pool Postgres connection pool
 */
let DetikDataSource = function DetikDataSource(
        config,
        pool
    ) {
    // Store references to config and pool
    this.config = config;
    this.pool = pool;

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
     * Last contribution ID from Detik result that was processed.
     * Used to ensure we don't process the same result twice.
     * @type {number}
     */
    _lastContributionId: 0,

    /**
     * Highest contribution ID from current batch of Detik results.
     * @type {number}
     */
    _highestBatchContributionId: 0,

    /**
     * Polling worker function.
     * Poll the Detik web service and process the results.
     * This method is called repeatedly on a timer.
     */
    _poll: function() {
        let self = this;

        // Keep track of the newest contribution ID we get in this poll.
        // Update our 'latest contribution ID' after we finish this whole batch.
        self._highestBatchContributionId = self._lastContributionId;

        // Begin processing results from page 1 of data
        self._fetchResults();
    },

    /**
     * When we've reached the end of this polling run,
     * update the stored contribution ID
     */
    _updateLastContributionIdFromBatch: function() {
        let self = this;

        if ( self._lastContributionId < self._highestBatchContributionId ) {
            self._lastContributionId = self._highestBatchContributionId;
        }
    },

    /**
     * Fetch one page of results
     * Call the callback function on the results
     * Recurse and call self to fetch the next page of results if required
     * @param {number} page Page number of results to fetch, defaults to 1
     */
    _fetchResults: function( page ) {
        let self = this;

        if (!page) page = 1;

        console.log( 'DetikDataSource > poll > fetchResults: Loading page ' +
        page );

        let requestURL = self.config.DETIK_URL + '&page=' + page;
        let response = '';

        let req = self.https.request( requestURL, function(res) {
          res.setEncoding('utf8');

          res.on('data', function(chunk) {
            response += chunk;
          });

          res.on('end', function() {
            let responseObject;
            try {
                responseObject = JSON.parse( response );
            } catch (e) {
                console.log( `DetikDataSource > poll > fetchResults: 
                    Error parsing JSON: ` + response );
                self._updateLastContributionIdFromBatch();
                return;
            }

            console.log('DetikDataSource > poll > fetchResults: Page ' + page +
                ' fetched, ' + response.length + ' bytes');

            if ( !responseObject || !responseObject.result ||
                responseObject.result.length === 0 ) {
                // If page has a problem or 0 objects, end
                console.log( `DetikDataSource > poll > fetchResults: No results 
                    found on page ` + page );
                self._updateLastContributionIdFromBatch();
                return;
            } else {
                // Run data processing callback on the result objects
                if ( self._filterResults( responseObject.result ) ) {
                    // If callback returned true, processing should continue on
                    // next page
                    page++;
                    self._fetchResults( page );
                }
            }
          });
        });

        req.on('error', function(error) {
            console.log( `DetikDataSource > poll > fetchResults: 
            Error fetching page ` + page + ', ' + error.message + ', ' +
            error.stack );
            self._updateLastContributionIdFromBatch();
        });

        req.end();
    },

    /**
     * Process the passed result objects
     * Stop processing if we've seen result before, or if the result is too old
     * @param {Array} results Array of result objects from Detik data to process
     * @return {boolean} True if we should continue to process more pages
     */
    _filterResults: function( results ) {
        let self = this;

        let continueProcessing = true;

        // For each result:
        let result = results.shift();
        while ( result ) {
            if ( result.contributionId <= self._lastContributionId ) {
                // We've seen this result before, stop processing
                console.log( `DetikDataSource > poll > processResults: 
                Found already processed result with contribution ID ` +
                result.contributionId );
                continueProcessing = false;
                break;
            } else if ( result.date.update.sec * 1000 < new Date().getTime() -
                self.config.HISTORICAL_LOAD_PERIOD ) {
                // This result is older than our cutoff, stop processing
                // TODO What date to use? transform to readable. timezone
                console.log( 'DetikDataSource > poll > processResults: Result '+
                 result.contributionId +
                ' older than maximum configured age of ' +
                self.config.HISTORICAL_LOAD_PERIOD / 1000 + ' seconds' );
                continueProcessing = false;
                break;
            } else {
                // Process this result
                console.log( `DetikDataSource > poll > processResults: 
                Processing result ` + result.contributionId );
                // Retain the contribution ID
                if ( self._highestBatchContributionId <
                    result.contributionId ) {
                    self._highestBatchContributionId = result.contributionId;
                }
                self._processResult( result );
            }
            result = results.shift();
        }

        if (!continueProcessing) {
            self._updateLastContributionIdFromBatch();
        }

        return continueProcessing;
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
             self._insertConfirmed(result);
         }
    },

        /**
     * Insert a confirmed report - i.e. has geo coordinates
     * Store both the detik report and the user hash
     * @param {detikReport} detikReport Detik report object
     * @return {Promise} - Result of database insert
     */
    _insertConfirmed: async function( detikReport ) {
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

                // Insert report
                const reportQuery = `INSERT INTO ${this.config.TABLE_DETIK} 
                            (contribution_id, created_at, disaster_type, text, 
                                lang, url, image_url, title, the_geom)
                            VALUES ( 
                            $1,  
                            to_timestamp($2),  
                            $3,  
                            $4,  
                            $5,  
                            $6,  
                            $7,  
                            $8,  
                            ST_GeomFromText('POINT($9'), 4326) 
                            );`;
                const reportValues = [
                            detikReport.contributionId,
                            detikReport.date.create.sec,
                            detikReport.content,
                            detikReport.lang,
                            detikReport.url,
                            detikReport.files.photo,
                            detikReport.title,
                            detikReport.location.geospatial.longitude + ' ' +
                            detikReport.location.geospatial.latitude,
                        ];

                await this.pool.query(reportQuery, reportValues);
                console.log('Logged confirmed Detik report');

                const userQuery = `SELECT detik.upsert_users(md5($1));`;
                const userValues = [detikReport.user.creator.id];
                await this.pool.query(userQuery, userValues);
                console.log('Logged Detik user');
            } catch (err) {
                console.log('Error processing Detik data.', err.message);
            }
    },

    /**
    * Get the last contribution ID as stored in the database
    * Update _lastContributionId
    */
    _updateLastContributionIdFromDatabase: async function() {
        let self = this;

        const query = `SELECT contribution_id FROM ${self.config.TABLE_DETIK}
        ORDER BY contribution_id DESC LIMIT 1;`;

        const result = await self.pool.query(query);

        if (result && result.rows && result.rows[0]) {
            self._lastContributionId = result.rows[0].contribution_id;
            console.log('Set last contribution ID from database');
        } else {
            console.log(`Error setting last contribution ID from 
            database (is the reports table empty?)`);
        }
    },

    /**
     * Start fetching Detik reports.
     * Setup polling and start fetching reports from the Detik feed.
     */
    start: function() {
        let self = this;

        // Initiate by getting last report ID from database
        self._updateLastContributionIdFromDatabase();

        // Called on interval to poll data source
        let poll = function() {
            console.log( 'DetikDataSource > start: Polling ' +
            self.config.DETIK_URL );
            self._poll();
        };

        // Poll now, immediately
        poll();
    },

};

// Export the PowertrackDataSource constructor
module.exports = DetikDataSource;
