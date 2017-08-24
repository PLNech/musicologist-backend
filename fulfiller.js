'use strict';
const algoliasearch = require('algoliasearch');

const State = Object.freeze({
    ARTIST_ONE: {context: "artistOne", event: "ARTIST_ONE"},
    ARTIST_OTHER: {context: "artistOther", event: "ARTIST_OTHER"},
    ARTIST_MISS: {context: "artistMiss", event: "ARTIST_MISS"},
    ARTIST_MANY: {context: "artistMany", event: "ARTIST_MANY"},
});

class Fulfiller {

    constructor(server) {
        this.server = server;
        this.version = 6;
        this.client = algoliasearch("TDNMRH8LS3", "ec222292c9b89b658fe00b34ff341194");
        this.index = this.client.initIndex("songs");
        this.resetResponse();
    }

    resetResponse() {
        this.response = {
            'source': "Algolia",
            'backend_version': this.version,
            data: []
        };
        this.responseIntent = undefined;
    }

    log(message) {
        this.server.log("Fulfiller", message);
    }

    sendReply(message, code) {
        if (message !== undefined) {
            this.response["speech"] = message;
            this.response["displayText"] = message;
        }
        if (code === undefined) {
            code = 200;
        }
        this.log("Reply(" + code + "):" + this.response["speech"]);
        this.reply(this.response).code(code);
    }

    serve(req, reply) {
        this.resetResponse();
        this.reply = reply;
        let artist = '', artistOriginal = '', period = '';
        let period_start = 0, period_end = 0;
        let artistNames = [], songs = [];

        if (!(req.mime && req.mime === "application/json")) {
            this.sendReply("Your request MUST be application/json.", 400);
            return;
        }

        if (req.payload.result.parameters['artist']) {
            artist = req.payload.result.parameters['artist'];
            artistOriginal = req.payload.result.contexts[0].parameters['artist.original'];
            this.log("Artist: " + artist);
        }
        if (req.payload.result.parameters['period']) {
            period = req.payload.result.parameters['period'];
            this.log("Period: " + period);
            [period_start, period_end] = period.split("/").map(Date.parse).map(x => x / 1000 /* engine expects second-level precision */);
            this.log("Split: " + period_start + " to " + period_end + " -> " + new Date(period_start) + " to " + new Date(period_end));
        }

        let searchQuery = '';
        const searchOptions = {};
        if (artist !== '') {
            searchOptions['restrictSearchableAttributes'] = ['artistName'];
            searchQuery = artist;
        }
        if (period !== '') {
            const filter = "release_timestamp: " + period_start + ' TO ' + period_end;
            this.log("filter: " + filter);
            searchOptions['filters'] = filter;
        } else if (artist === '' && period === '') {
            this.log("No artist nor period -> nothing to search.");
            this.sendReply("I can't search for nothing. Please ask me about music by an artist or from a date/perion!");
            return;
        }

        this.index.search(searchQuery, searchOptions, (err, content) => {
                if (err) {
                    this.log(err);
                    return;
                }

                this.log("Searching for " + artist + " returned " + content.nbHits + " results.");
                if (content.nbHits > 0) {
                    for (let i in content.hits) {
                        let hit = content.hits[i];
                        if (artistNames.indexOf(hit.artistName) === -1) {
                            artistNames.push(hit.artistName);
                        }
                        this.log('Hit(' + hit.objectID + '): ' + hit.trackName);
                        songs.push(hit);
                    }
                    this.response["data"] = {"songs": songs};
                    const artistIsFoundExact = artistNames.indexOf(artist) !== -1;

                    if (artistNames.length === 1) {
                        if (artistIsFoundExact) { // We found the expected artist -> trigger ARTIST_ONE event
                            this.responseIntent = State.ARTIST_ONE;
                        } else { // We found another artist -> trigger ARTIST_OTHER event
                            this.responseIntent = State.ARTIST_OTHER;
                        }
                    } else { // We found several artists -> trigger ARTIST_MANY
                        this.responseIntent = State.ARTIST_MANY;
                    }
                } else { // We found no artists -> trigger ARTIST_MISS
                    this.responseIntent = State.ARTIST_MISS;
                }


                this.response["contextOut"] = [{
                    name: this.responseIntent.context,
                    parameters: {
                        'artistNames': artistNames,
                        'artistOriginal': artistOriginal,
                        'songTitles': songs.map(hit => hit.trackName)
                    },
                    lifespan: 1
                }];
                this.response['followupEvent'] = {
                    name: this.responseIntent.event,
                };
                this.sendReply();
            }
        );
    };

}

let fulfiller = undefined;
module.exports = function (request, reply) {
    if (fulfiller === undefined) {
        fulfiller = new Fulfiller(require("./server"));
        fulfiller.log("New fulfiller!");
    }
    fulfiller.serve(request, reply);
};