/* eslint-disable max-len */
require('dotenv').config({silent: true});

export default {
    DETIK_URL: process.env.DETIK_URL,
    HISTORICAL_LOAD_PERIOD: process.env.HISTORICAL_LOAD_PERIOD || 3600000,
    COGNICITY_FEED_ENDPOINT: process.env.COGNICITY_FEED_ENDPOINT || 'https://data-dev.petabencana.id/feeds/detik/',
};
