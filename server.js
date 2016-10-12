var co = require('co');
var timeout = require('timeout-then');
/*global console*/
var yetify = require('yetify'),
    config = require('getconfig'),
    fs = require('fs'),
    sockets = require('./sockets'),
    port = parseInt(process.env.PORT || config.server.port, 10),
    server_handler = function (req, res) {
        res.writeHead(404);
        res.end();
    },
    server = null;

// Create an http(s) server instance to that socket.io can listen to
if (config.server.secure) {
    server = require('https').Server({
        key: fs.readFileSync(config.server.key),
        cert: fs.readFileSync(config.server.cert),
        passphrase: config.server.password
    }, server_handler);
} else {
    server = require('http').Server(server_handler);
}
server.listen(port);

sockets(server, config);

if (config.uid) process.setuid(config.uid);

var httpUrl;
if (config.server.secure) {
    httpUrl = "https://localhost:" + port;
} else {
    httpUrl = "http://localhost:" + port;
}
console.log(yetify.logo() + ' -- signal master is running at: ' + httpUrl);

// Handle Exceptions
process.once('unhandledRejection', function (err) {
    console.error('unhandledRejection', err.stack);
});
process.once('uncaughtException', function (err) {
    console.error('uncaughtException', err.stack);
    gracefulShutdown('uncaughtException', err);
});
// Handle Signals
process.on('SIGTERM', function () {
    console.error('SIGTERM');
    gracefulShutdown('SIGTERM');
});
process.on('SIGINT', function () {
    console.error('SIGINT');
    gracefulShutdown('SIGINT');
});

var shuttingDown = false;
function gracefulShutdown(event, err) {
    // timeout promise
    var timeoutPromise = timeout(15 * 1000 * 60); // 15s
        // graceful shutdown promise
    var promise = co(function * () {
        if (shuttingDown) {
            console.error('already shutting down');
            return;
        }
        shuttingDown = true;
        console.error('shutting down', event);
        // drain server, stop accepting new connections
        yield server.close.bind(server);
        console.error('server closed successfully', event);
    }).then(() => {
        timeoutPromise.clear();
        shuttingDown = false;
    });
    // race graceful shutdown w/ timeout
    return Promise.race([
        timeoutPromise.then(() => {
            throw new Error('500 - graceful shutdown timedout');
        }),
        promise
    ]).catch(handleShutdownErr);
}
function handleShutdownErr(err) {
    console.error('graceful shutdown error', err.stack);
    process.exit(1);
}
