'use strict';
const algoliasearch = require('algoliasearch');

class Fulfiller {

    constructor(server) {
        this.server = server;
        this.version = 5;
        this.client = algoliasearch("TDNMRH8LS3", "ec222292c9b89b658fe00b34ff341194");
        this.index = this.client.initIndex("songs");
        this.response = {
            'source': "Algolia",
            'backend_version': this.version,
            data: []
        };
    }

    log(message) {
        this.server.log("Fulfiller", message);
    }

    sendReply(message, code) {
        if (message != undefined) {
            this.response["speech"] = message;
            this.response["displayText"] = message;
        }
        if (code == undefined) {
            code = 200;
        }
        this.log("Reply(" + code + "):" + this.response["speech"]);
        this.reply(this.response).code(code);
    }

    serve(req, reply) {
        this.reply = reply;
        let artist = '', artistOriginal = '', period = '';
        let period_start = 0, period_end = 0;
        let artistNames = [], songs = [];

        if (!(req.mime && req.mime == "application/json")) {
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
        if (artist != '') {
            searchOptions['restrictSearchableAttributes'] = ['artistName'];
            searchQuery = artist;
        }

        if (period != '') {
            const filter = "release_timestamp: " + period_start + ' TO ' + period_end;
            this.log("filter: " + filter);
            searchOptions['filters'] = filter;
        }

        if (artist == '' && period == '') {
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
                        if (artistNames.indexOf(hit.artistName) == -1) {
                            artistNames.push(hit.artistName);
                        }
                        this.log('Hit(' + hit.objectID + '): ' + hit.trackName);
                        songs.push(hit);
                    }
                    this.response["data"] = {"songs": songs};
                    const artistIsFoundExact = artistNames.indexOf(artist) != -1;

                    if (artistNames.length == 1) {
                        if (artistIsFoundExact) { // We found the expected artist
                            this.response["speech"] = "I found those songs by " + artistNames[0] + ": " + songs.map(hit => hit.trackName).join(", ") + ".";
                        } else { // We found another artist -> trigger OTHER_ARTIST event
                            this.response["contextOut"] = [{
                                name: "otherArtist",
                                parameters: {
                                    'artistOriginal': artistOriginal,
                                    'artistActual': artistNames[0]
                                },
                                lifespan: 2
                            }];
                            delete this.response.data
                        }
                    } else { // We found several artists -> reply with the input
                        this.response["speech"] = "I found those songs from several artists matching \"" + artistOriginal + "\": " + songs.map(hit => hit.trackName).join(", ") + ".";
                        this.response["data"]["artists"] = artistNames;
                    }
                } else {
                    this.response["speech"] = "I'm afraid I know no songs by " + artist + ".";
                }
                this.sendReply();
            }
        );
    };

}

let fulfiller = undefined;
module.exports = function (request, reply) {
    if (fulfiller == undefined) {
        fulfiller = new Fulfiller(require("./server"));
        fulfiller.log("New fulfiller!");
    }
    fulfiller.serve(request, reply);
};