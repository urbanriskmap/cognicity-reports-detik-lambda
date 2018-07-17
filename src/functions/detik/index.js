import config from '../../config';
import DetikDataSource from '../../lib/detik';

// Endpoint for detik polling lambda
export default (event, context, callback) => {
    // Create instance
    const detikDataSource = new DetikDataSource(config);

    // Start polling
    detikDataSource.start()
        .then(function() {
            callback(null);
        }).catch(function(err) {
            console.log('Error running Detik poll.', err.message);
            callback(err);
        });
};
