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
            'followupEvent': {name: "RESULTS", data: this.parameters}
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
        let artist = '', theme = '';
        let artistNames = [], songs = [];

        if (!(req.mime && req.mime === "application/json")) {
            this.sendReply("Your request MUST be application/json.", 400);
            return;
        }

        if (!req.payload.result.metadata.intentName.startsWith("Search")) {
            this.log("Action requested is not search (" + req.payload.result.action + ").");
            this.log("Request: " + JSON.stringify(req.payload, undefined, 1));
            this.sendReply(undefined, 200);
            return;
        }

        if (req.payload.result.parameters['artistName']) {
            artist = req.payload.result.parameters['artistName'];
            this.log("Artist: " + artist);
        }
        if (req.payload.result.parameters['theme']) {
            theme = req.payload.result.parameters['theme'];
            this.log("Theme: " + theme);
        }

        let searchQuery = artist + ' ' + theme;
        const searchOptions = {};
        if (theme === '') {
            if (artist === '') {
                this.log("No artist nor theme -> nothing to search.");
                this.log("Req: " + JSON.stringify(req.payload, undefined, 1));
                //TODO Improve texts. Use event?
                this.sendReply("I can't search for nothing. Please ask me about music by an artist or about a theme!");
                return;
            }
            searchOptions['restrictSearchableAttributes'] = ['artistName'];
            searchQuery = artist;
        }

        this.index.search(searchQuery, searchOptions, (err, content) => {
                if (err) {
                    this.log(err);
                    return;
                }

                this.log("Searching for \"" + searchQuery + "\" returned " + content.nbHits + " results.");
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
                this.parameters['data'] = content;
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