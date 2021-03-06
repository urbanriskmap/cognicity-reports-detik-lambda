/* eslint-disable max-len */
require('dotenv').config({silent: true});

export default {
    DETIK_URL: process.env.DETIK_URL,
    HISTORICA_LOAD_PERIOD: process.env.HISTORICAL_LOAD_PERIOD || 3600000,
    PGUSER: process.env.PGUSER || 'postgres',
    PGPASSWORD: process.env.PGPASSWORD,
    PGHOST: process.env.PGHOST || 'localhost',
    PGPORT: process.env.PGPORT || 5432,
    PGDATABASE: process.env.PGDATABASE || 'cognicity',
    PGSSL: process.env.PGSSL === 'true' || false,
    PG_CLIENT_IDLE_TIMEOUT: process.env.PG_CLIENT_IDLE_TIMEOUT || 100,
    TABLE_DETIK: process.env.TABLE_DETIK || 'detik.reports',
};
