'use strict';
const algoliasearch = require('algoliasearch');
const WORDINGS = {one: 1, two: 2, three: 3, several: 4};
const OPTIONS = {};
OPTIONS[WORDINGS.one] = ["a", "one", "a single"];
OPTIONS[WORDINGS.two] = ["two", "a couple", "a pair of"];
OPTIONS[WORDINGS.three] = ["three", "a few"];
OPTIONS[WORDINGS.several] = ["several", "quite a few", "various"];
const NAMES = ["song", "tune", "track"];

class Fulfiller {

    constructor(server) {
        this.server = server;
        this.version = process.env.HEROKU_RELEASE_VERSION !== undefined ?
            process.env.HEROKU_RELEASE_VERSION : 6;
        this.client = algoliasearch("TDNMRH8LS3", "ec222292c9b89b658fe00b34ff341194");
        this.index = this.client.initIndex("songs");
        this.resetResponse();
    }

    resetResponse() {
        this.parameters = {backendVersion: this.version};
        this.response = {
            'source': "Algolia",
            'followupEventInput': {name: "RESULTS", parameters /*TODO:data?*/: this.parameters}
        };
    }

    log(message) {
        this.server.log("Fulfiller", message);
    }

    sendReply(errorMessage, code) {
        if (errorMessage !== undefined) {
            this.parameters["error"] = errorMessage;
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

        this.log("Request: " + JSON.stringify(req.payload, undefined, 1));

        if (!(req.mime && req.mime === "application/json")) {
            this.sendReply("Your request MUST be application/json.", 400);
            return;
        }

        if (!req.payload.queryResult.intent.displayName.startsWith("Search")) {
            this.log("Action requested is not search (" + req.payload.queryResult.action + ").");
            this.log("Request: " + JSON.stringify(req.payload, undefined, 1));
            this.sendReply(undefined, 200);
            return;
        }

        if (req.payload.queryResult.parameters['artistName']) {
            artist = req.payload.queryResult.parameters['artistName'];
            this.log("Artist: " + artist);
        }

        if (req.payload.queryResult.parameters['theme']) {
            theme = req.payload.queryResult.parameters['theme'];
            this.parameters['theme'] = theme;
            this.log("Theme: " + theme);
        }

        let searchQuery = artist + ' ' + theme;
        const searchOptions = {};
        if (theme === '') {
            if (artist !== '') {
                searchOptions['restrictSearchableAttributes'] = ['artistName'];
                searchQuery = artist;
            } else {
                this.log("No artist nor theme -> nothing to search. Req: " + JSON.stringify(req.payload, undefined, 1));
                this.sendReply("I can't search for nothing. Please ask me about music by an artist or about a theme!");
                return;
            }
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
                this.parameters['songCount'] = undefined;
                this.parameters['songTitles'] = undefined;
                switch (songs.length) {
                    case 0:
                        break;
                    case 1:
                        this.parameters['songCount'] = Fulfiller.randomWording(WORDINGS.one);
                        this.parameters['songTitles'] = songs[0].trackName;
                        break;
                    case 2:
                        this.parameters['songCount'] = Fulfiller.randomWording(WORDINGS.two);
                        this.parameters['songTitles'] = songs.map(hit => hit.trackName).join(" and ");
                        break;
                    case 3:
                        this.parameters['songCount'] = Fulfiller.randomWording(WORDINGS.three);
                        this.parameters['songTitles'] = songs.map(hit => hit.trackName).join(", ");
                        break;
                    default:
                        this.parameters['songCount'] = Fulfiller.randomWording(WORDINGS.several);
                        this.parameters['songTitles'] = songs.slice(0, 3).map(hit => hit.trackName).join(", ") + "..";
                        break;
                }
                this.parameters['data'] = content;
                this.sendReply();
            }
        );
    };

    static randomWording(keyword) {
        const quantifiers = OPTIONS[keyword];
        const quantifier = quantifiers[Math.floor(Math.random() * quantifiers.length)];

        const name = NAMES[Math.floor(Math.random() * NAMES.length)];
        const plural = keyword > 1 ? "s" : "";

        return quantifier + " " + name + plural;
    }
}

let fulfiller = undefined;
module.exports = function (request, reply) {
    if (fulfiller === undefined) {
        fulfiller = new Fulfiller(require("./server"));
        fulfiller.log("New fulfiller!");
    }
    fulfiller.serve(request, reply);
};