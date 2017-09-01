'use strict';
const algoliasearch = require('algoliasearch');

class Fulfiller {

    constructor(server) {
        this.server = server;
        this.version = 6;
        this.client = algoliasearch("TDNMRH8LS3", "ec222292c9b89b658fe00b34ff341194");
        this.index = this.client.initIndex("songs");
        this.resetResponse();
    }

    resetResponse() {
        this.parameters = {};
        this.response = {
            'source': "Algolia",
            'backend_version': this.version,
            'contextOut': [{
                name: "results",
                parameters: this.parameters,
                lifespan: 1
            }]
        };
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

        this.log("Reply(" + code + "):" + JSON.stringify(this.response, (key, value) => {
            switch (key) {
                case 'hits':
                    return '[...]';
                case 'source':
                    return
            }
            return value;
        }, 1));
        this.reply(this.response).code(code);
    }

    serve(req, reply) {
        this.resetResponse();
        this.reply = reply;
        let artist = '', period = '';
        let period_start = 0, period_end = 0;
        let artistNames = [], songs = [];

        if (!(req.mime && req.mime === "application/json")) {
            this.sendReply("Your request MUST be application/json.", 400);
            return;
        }

        if (req.payload.result.action !== "search") {
            this.log("Action requested is not search (" + req.payload.result.action + ").");
            this.sendReply(undefined, 200);
            return;
        }

        if (req.payload.result.parameters['artistName']) {
            artist = req.payload.result.parameters['artistName'];
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
                    const artistIsFoundExact = artistNames
                        .map(it => it.toLowerCase()).indexOf(artist.toLowerCase()) !== -1;

                    if (artistNames.length === 1) {
                        if (artistIsFoundExact) { // We found the expected artist
                            this.parameters["artist"] = artistNames[0];
                        } else { // We found another artist
                            this.parameters["artistOther"] = artistNames[0];
                        }
                    } else { // We found several artists
                        this.parameters["artistNames"] = artistNames;
                    }
                }

                this.parameters['artistName'] = artist;
                this.parameters['songTitles'] = songs.length > 0 ? songs.map(hit => hit.trackName) : undefined;
                this.response['data'] = content;
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