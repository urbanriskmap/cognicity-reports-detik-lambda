/* eslint-disable max-len */
require('dotenv').config({silent: true});

export default {
    DETIK_URL: process.env.DETIK_URL,
    HISTORICA_LOAD_PERIOD: process.env.HISTORICAL_LOAD_PERIOD || 3600000,
    TABLE_DETIK: process.env.TABLE_DETIK || 'detik.reports',
};
