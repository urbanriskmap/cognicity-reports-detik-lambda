import {Pool} from 'pg'; // Postgres
import config from '../../config';
import DetikDataSource from '../../lib/detik';

// Connection object
const cn = `postgres://${config.PGUSER}:${config.PGPASSWORD}@${config.PGHOST}:${config.PGPORT}/${config.PGDATABASE}?ssl=${config.PGSSL}`;

// Create a pool object
const pool = new Pool({
  connectionString: cn,
  idleTimeoutMillis: config.PG_CLIENT_IDLE_TIMEOUT,
});

// Endpoint for detik polling lambda
export default async (event, context, callback) => {
    try {
            // Catch database errors
            pool.on('error', (err, client) => {
                console.error('Unexpected error on idle client', err);
            });

            // Create instance
            const detikDataSource = new DetikDataSource(config, pool);

            // Start polling
            detikDataSource.start();
    } catch (err) {
        console.log('Error running Detik poll.', err.message);
    }
};
