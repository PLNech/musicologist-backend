const Hapi = require('hapi');
const Good = require('good');
const algoliasearch = require('algoliasearch');
const client = algoliasearch("TDNMRH8LS3", "ec222292c9b89b658fe00b34ff341194");
const index = client.initIndex("songs");
const version = 5;

const handleFulfilment = function (req, reply) {
    const TAG = "fulfil";
    let artist = '', artistOriginal = '', period = '';
    let period_start = 0, period_end = 0;
    let artistNames = [], songs = [];
    let response = {
        'source': "Algolia",
        'backend_version': version,
        data: []
    };

    let sendReply = function (message, code) {
        if (message != undefined) {
            response["speech"] = message;
            response["displayText"] = message;
        }
        if (code == undefined) {
            code = 200;
        }
        server.log(TAG, "Reply(" + code + "):" + response["speech"]);
        reply(response).code(code);
    };

    if (!(req.mime && req.mime == "application/json")) {
        sendReply("Your request MUST be application/json.", 400);
        return;
    }

    if (req.payload.result.parameters['artist']) {
        artist = req.payload.result.parameters['artist'];
        artistOriginal = req.payload.result.contexts[0].parameters['artist.original'];
        server.log(TAG, "Artist: " + artist);
    }
    if (req.payload.result.parameters['period']) {
        period = req.payload.result.parameters['period'];
        server.log(TAG, "Period: " + period);
        [period_start, period_end] = period.split("/").map(Date.parse).map(x => x / 1000 /* engine expects second-level precision */);
        server.log(TAG, "Split: " + period_start + " to " + period_end + " -> " + new Date(period_start) + " to " + new Date(period_end));
    }


    let searchQuery = '';
    const searchOptions = {};
    if (artist != '') {
        searchOptions['restrictSearchableAttributes'] = ['artistName'];
        searchQuery = artist;
    }

    if (period != '') {
        const filter = "release_timestamp: " + period_start + ' TO ' + period_end;
        server.log(TAG, "filter: " + filter);
        searchOptions['filters'] = filter;
    }

    if (artist == '' && period == '') {
        server.log(TAG, "No artist nor period -> nothing to search.");
        sendReply("I can't search for nothing. Please ask me about music by an artist or from a date/perion!");
        return;
    }

    index.search(searchQuery, searchOptions, (err, content) => {
            if (err) {
                server.log(err);
                return;
            }

            server.log(TAG, "Searching for " + artist + " returned " + content.nbHits + " results.");
            if (content.nbHits > 0) {
                for (let i in content.hits) {
                    let hit = content.hits[i];
                    if (artistNames.indexOf(hit.artistName) == -1) {
                        artistNames.push(hit.artistName);
                    }
                    server.log(TAG, 'Hit(' + hit.objectID + '): ' + hit.trackName);
                    songs.push(hit);
                }
                response["data"] = {"songs": songs};
                const artistIsFoundExact = artistNames.indexOf(artist) != -1;

                if (artistNames.length == 1) {
                    if (artistIsFoundExact) { // We found the expected artist
                        response["speech"] = "I found those songs by " + artistNames[0] + ": " + songs.map(hit => hit.trackName).join(", ") + ".";
                    } else { // We found another artist -> trigger OTHER_ARTIST event
                        response["contextOut"] = [{
                            name: "otherArtist",
                            parameters: {
                                'artistOriginal': artistOriginal,
                                'artistActual': artistNames[0]
                            },
                            lifespan: 2
                        }];
                        delete response.data
                    }
                } else { // We found several artists -> reply with the input
                    response["speech"] = "I found those songs from several artists matching \"" + artistOriginal + "\": " + songs.map(hit => hit.trackName).join(", ") + ".";
                    response["data"]["artists"] = artistNames;
                }
            } else {
                response["speech"] = "I'm afraid I know no songs by " + artist + ".";
            }
            sendReply();
        }
    );
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