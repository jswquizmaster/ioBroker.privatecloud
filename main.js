'use strict';

/*
 * Created with @iobroker/create-adapter v1.24.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");
var Client = require('ssh2').Client;


class Privatecloud extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'privatecloud',
        });
        this.serverListening = false;
        this.connection = new Client();
        this.serverport = 3000;
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        const adapter = this;
        const conn = this.connection;

        function connectToProxy() {
            const servername = adapter.config.serverAddress;
            const serverport = 22;
            const username = adapter.config.userName;
            const privatekey = adapter.config.privateKey;

            adapter.log.info(`Connecting to ${servername}:${serverport}`);
            adapter.connection.connect({
                host: servername,
                port: serverport,
                username: username,
                keepaliveInterval: 90*1000,
                privateKey: privatekey
            });
        }

        /*
        await this.setObjectAsync('connection', {
            type: 'state',
            common: {
                name: 'If connected to private cloud',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: true,
            },
            native: {},
        });

        await this.setStateAsync('connection', this.serverListening);
        */

        try {
            connectToProxy();
        } catch (err) {
            adapter.log.error(`Cannot connect to proxy server: ${err}`);
            this.terminate ? this.terminate(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION) : process.exit(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
            return;
        }

        conn.on('ready', function() {
            adapter.log.info('*** SSH: proxy connection established');

            conn.shell({ window: false }, function(err, stream) {
                if (err) throw err;

                stream.on('close', function() {
                    adapter.log.info('*** SSH: closed');
                }).on('data', function(data) {
                    adapter.log.info('SSH: ' + data);
                    if (data == 'READY') {
                        adapter.log.info('SSH: Setting up tunnel');
                        conn.forwardIn('127.0.0.1', adapter.config.forwardPort, function(err) {
                            if (err) throw err;
                            adapter.log.info('*** SSH: tunnel connection established');
                        });
                    }
                });

                stream.write('while [ "$(ps -ef | grep sshd | grep -v -e grep -e root | grep $USER | wc -l)" -gt "1" ]; do pkill -o -u $USER sshd; done && echo "READY"\r\n')
            });
        });

        conn.on('tcp connection', function(info, accept, reject) {
            adapter.log.info('TCP :: INCOMING CONNECTION:');
            adapter.log.info(info);
            let session = accept();

            session.on('close', function() {
                adapter.log.info('TCP :: CLOSED');
            }).on('error', function(e) {
                adapter.log.info('TCP :: ERROR ' + e);
            }).on('data', function(data) {
                adapter.log.debug('TCP :: DATA: ' + data);

                var parts = data.toString().split( '\r\n\r\n' );
                let body = parts[1];

                adapter.log.debug(body);

                adapter.sendTo('iot.0', 'private', {type: 'alexa', request: body}, response => {
                    // Send this response back to alexa service
                    const rsp = JSON.stringify(response);
                    adapter.log.debug(rsp);

                    var header = 'HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length:'+ rsp.length +'\r\n';
                    session.end(header + '\r\n' + rsp);
                });
            });
        });

        conn.on('error', function(err) {
            adapter.log.info('SSH: ' + err + ' -> Reconnect');

            // Reconnect in 5 seconds
            setTimeout(connectToProxy, 5000);
        });
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if (this.connection) {
                this.log.info('disconnecting from proxy server...');
                this.connection.end();
            }
            callback();
        } catch (e) {
            callback();
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Privatecloud(options);
} else {
    // otherwise start the instance directly
    new Privatecloud();
}
