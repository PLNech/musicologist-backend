'use strict';
const Hapi = require('hapi');
const Good = require('good');
const Fulfiller = require('./fulfiller');
const AuthBearer = require('hapi-auth-bearer-token');

const AUTH_TOKEN = process.env.MUSICOLOGIST_AUTH_TOKEN;

// Init server
const server = new Hapi.Server();
server.connection({
    host: +process.env.HOST || '0.0.0.0',
    port: +process.env.PORT || 8000
});

// Setup Auth
server.register(AuthBearer, () => {
    server.auth.strategy('simple', 'bearer-access-token', {
        validateFunc: function (token, callback) {
            return callback(null, token === AUTH_TOKEN, {token: token});
        }
    });

    // Setup routes
    server.route([
        {
            method: 'GET',
            path: '/',
            handler: function (request, reply) {
                reply("Success!\n");
            }
        },
        {
            method: 'GET',
            path: '/wakeup',
            handler: function (request, reply) {
                reply();
            }
        },
        {
            method: 'POST',
            path: '/fulfillment',
            handler: Fulfiller,
            config: {auth: "simple"}
        }
    ]);
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

module.exports = server;