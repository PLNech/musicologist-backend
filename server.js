const Hapi = require('hapi');
const Good = require('good');
const algoliasearch = require('algoliasearch');
const client = algoliasearch("TDNMRH8LS3", "ec222292c9b89b658fe00b34ff341194");
const index = client.initIndex("songs");
const version = 1;

const handleFulfilment = function (req, reply) {
    const TAG = "fulfil";
    let response = {
        'source': "Algolia",
        'backend_version': version,
        data: []
    };

    let artist = '';
    if (req.payload.result.parameters['artist']) {
        artist = req.payload.result.parameters['artist'];
        server.log(TAG, "Artist: " + artist);
    }

    let period = '';
    if (req.payload.result.parameters['period']) {
        period = req.payload.result.parameters['period'];
        server.log(TAG, "Period: " + period);
    }

    if (artist.length !== 0) {
        let songs = [];
        index.search(artist, (err, content) => {
            if (err) {
                server.error(err);
                return;
            }

            server.log(TAG, "Searching for " + artist + " returned " + content.nbHits + " results.");
            if (content.nbHits > 0) {
                for (let i in content.hits) {
                    let hit = content.hits[i];
                    server.log(TAG, 'Hit(' + hit.objectID + '): ' + hit.trackName);
                    songs.push(hit.trackName);
                }
                response["speech"] = "I found those songs: " + songs.join(", ") + ".";
                response["data"] = songs;
            } else {
                response["speech"] = "I'm afraid I know no songs from " + artist + ".";
            }
            server.log(TAG, "speech:" + response["speech"]);
            response["displayText"] = response["speech"];
            reply(response);
        });
    }
};

// Init server
const server = new Hapi.Server();
server.connection({
    host: +process.env.HOST || '0.0.0.0',
    port: +process.env.PORT || 8000
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
        method: 'POST',
        path: '/fulfillment',
        handler: handleFulfilment
    }
]);

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