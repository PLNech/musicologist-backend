const Hapi = require('hapi');

get = function (request, reply) {
    reply("Success!\n");
};

const server = new Hapi.Server();
server.connection({
    host: +process.env.HOST || '0.0.0.0',
    port: +process.env.PORT || 8000
});
server.route({
    method: 'GET',
    path: '/',
    handler: get
});

server.start((err) => {
   if (err) {
       throw err;
   }

   console.log("Server running at ", server.info.uri);
});