const Hapi = require('hapi');
const Good = require('good');
const algoliasearch = require('algoliasearch');
const client = algoliasearch("TDNMRH8LS3", "ec222292c9b89b658fe00b34ff341194");
const index = client.initIndex("songs");
const version = 3;

const handleFulfilment = function (req, reply) {
    const TAG = "fulfil";
    let response = {
        'source': "Algolia",
        'backend_version': version,
        data: []
    };
    let artist = '', artistOriginal = '', period = '', artistActual = '';
    let allHitsHaveSameArtist = true;

    if (req.payload.result.parameters['artist']) {
        artist = req.payload.result.parameters['artist'];
        artistOriginal = req.payload.result.contexts[0].parameters['artist.original'];
        server.log(TAG, "Artist: " + artist);
    }
    if (req.payload.result.parameters['period']) {
        period = req.payload.result.parameters['period'];
        server.log(TAG, "Period: " + period);
    }

    if (artist.length !== 0) { // Search for the given artist
        let songs = [];
        index.search(artist, {restrictSearchableAttributes: ['artistName']}, (err, content) => {
                if (err) {
                    server.error(err);
                    return;
                }

                server.log(TAG, "Searching for " + artist + " returned " + content.nbHits + " results.");
                if (content.nbHits > 0) {
                    for (let i in content.hits) {
                        let hit = content.hits[i];
                        if (hit.artistName != artist) {
                            if (artistActual == '') {
                                artistActual = hit.artistName;
                            } else {
                                if (artistActual != hit.artistName) {
                                    allHitsHaveSameArtist = false;
                                }
                            }
                        }
                        server.log(TAG, 'Hit(' + hit.objectID + '): ' + hit.trackName);
                        songs.push(hit);
                    }
                    response["data"] = {"songs": songs};
                    if (allHitsHaveSameArtist) {
                        if (artistActual != '') {
                            response["followupEvent"] = {"name": "OTHER_ARTIST", data: {
                                'artistOriginal': artistOriginal,
                                'artist': artistActual
                            }};
                        } else {
                            response["speech"] = "I found those songs by " + currentArtist + ": " + songs.map(hit => hit.trackName).join(", ") + ".";
                        }
                    } else { // Several artists not matching the input, reply with `for input`
                        response["speech"] = "I found those songs for " + artistOriginal + ": " + songs.map(hit => hit.trackName).join(", ") + ".";
                    }
                }
                else {
                    response["speech"] = "I'm afraid I know no songs from " + artist + ".";
                }
                server.log(TAG, "speech:" + response["speech"]);
                response["displayText"] = response["speech"];
                reply(response);
            }
        );
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