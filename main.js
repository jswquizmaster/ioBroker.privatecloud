'use strict';

/*
 * Created with @iobroker/create-adapter v1.24.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");
const http = require('http');


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
        this.webserver = null;
        this.serverport = 3000;
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        const adapter = this;
        this.log.info('config local port: ' + this.config.localPort);
        this.serverport = parseInt(this.config.localPort, 10);

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
            this.webserver = http.createServer(function (req, res) {
                if (req.method == 'POST') {
                    let body = '';
            
                    req.on('data', function (data) {
                        body += data;
            
                        // Too much POST data, kill the connection!
                        // 1e4 === 1 * Math.pow(10, 4) === 1 * 10000 ~~~ 10KB
                        if (body.length > 1e4)
                            req.connection.destroy();
                    });
            
                    req.on('end', function () {
                        adapter.log.debug(body);
                        adapter.sendTo('iot.0', 'private', {type: 'alexa', request: body}, response => {
                            // Send this response back to alexa service
                            adapter.log.debug(JSON.stringify(response));
        
                            res.writeHead(200, {'Content-Type': 'application/json'});
                            res.write(JSON.stringify(response)); //write a response to the client
                            res.end(); //end the response
                        });
                    });
                }    
            });
        } catch (err) {
            this.log.error(`Cannot create webserver: ${err}`);
            this.terminate ? this.terminate(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION) : process.exit(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
            return;
        }

        this.webserver.on('error', e => {
            this.log.error(`Cannot start server on '0.0.0.0'}:${this.serverport}: ${e}`);
            
            if (!this.serverListening) {
                this.terminate ? this.terminate(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION) : process.exit(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
            }
        });

        this.webserver.listen(this.serverport, () => {
            this.log.info(`http server listening on port ${this.serverport}`);
            this.serverListening = true;
        });
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if (this.webserver) {
                this.log.info('terminating http server on port ' + this.serverport);
                this.webserver.close();
                this.webserver = null;
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
