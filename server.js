const Hapi = require('hapi');
const Good = require('good');

// Init server
const server = new Hapi.Server();
server.connection({
    host: +process.env.HOST || '0.0.0.0',
    port: +process.env.PORT || 8000
});

// Setup routes
server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
        reply("Success!\n");
    }
});

// Setup reporting
server.register({
    register: Good,
    options: {
        reporters: {
            console: [{
                module: 'good-squeeze',
                name: 'Squeeze',
                args: [{
                    response: '*',
                    log: '*'
                }]
            }, {
                module: 'good-console'
            }, 'stdout']
        }
    }
}, (err) => {
    if (err) {
        throw err; // error while loading the plugin
    }
});

// Run server
server.start((err) => {
    if (err) {
        throw err;
    }

    console.log("Server running at ", server.info.uri);
});