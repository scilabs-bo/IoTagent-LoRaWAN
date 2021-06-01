/*
 * Copyright 2019 Atos Spain S.A
 *
 * This file is part of iotagent-lora
 *
 * iotagent-lora is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * iotagent-lora is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with iotagent-lora.
 * If not, seehttp://www.gnu.org/licenses/.
 *
 */

/* eslint-disable no-unused-vars */

const got = require('got');
const iotAgentConfig = require('../config-test.js');
const utils = require('../utils');
const iotagentLora = require('../../');
const iotAgentLib = require('iotagent-node-lib');
const mqtt = require('async-mqtt');
const { promisify } = require('util');
require('chai/register-should');

describe('CBOR Attributes', function () {
    let testMosquittoHost = 'localhost';
    let orionHost = iotAgentConfig.iota.contextBroker.host;
    let orionPort = iotAgentConfig.iota.contextBroker.port;
    let orionServer = orionHost + ':' + orionPort;
    const service = 'smartgondor';
    const subservice = '/gardens';

    function readEnvVariables() {
        if (process.env.TEST_MOSQUITTO_HOST) {
            testMosquittoHost = process.env.TEST_MOSQUITTO_HOST;
        }

        if (process.env.IOTA_CB_HOST) {
            orionHost = process.env.IOTA_CB_HOST;
            iotAgentConfig.iota.contextBroker.host = orionHost;
        }

        if (process.env.IOTA_CB_PORT) {
            orionPort = process.env.IOTA_CB_PORT;
            iotAgentConfig.iota.contextBroker.port = orionPort;
        }

        orionServer = orionHost + ':' + orionPort;

        if (process.env.TEST_MONGODB_HOST) {
            iotAgentConfig.iota.mongodb.host = process.env.TEST_MONGODB_HOST;
        }
    }

    before(async function () {
        readEnvVariables();
        await utils.deleteEntityCB(iotAgentConfig.iota.contextBroker, service, subservice, 'LORA-N-003');
        await promisify(iotagentLora.start.bind(iotagentLora, iotAgentConfig))();
    });

    after(async function () {
        await promisify(iotAgentLib.clearAll)();
        await promisify(iotagentLora.stop)();
        await utils.deleteEntityCB(iotAgentConfig.iota.contextBroker, service, subservice, 'LORA-N-003');
    });

    describe('When a device provisioning request with all the required data arrives to the IoT Agent. Proprietary decoding at application server', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provisionDeviceApplicationServer1TTN.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };
        const optionsGetDevice = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        it('should add the device to the devices list', async function () {
            if (testMosquittoHost) {
                options.json.devices[0].internal_attributes.lorawan.application_server.host = testMosquittoHost;
            }

            let response = await got(options);
            response.should.be.an('object');
            response.should.have.property('statusCode', 201);
            await utils.delay(500);
            response = await got(optionsGetDevice);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 1);
            response.body.should.have.property('devices');
            response.body.devices.should.be.an('array');
            response.body.devices.should.have.length(1);
            response.body.devices[0].should.have.property('device_id', options.json.devices[0].device_id);
        });

        it('should register the entity in the CB', async function () {
            const optionsCB = {
                url: 'http://' + orionServer + '/v2/entities/' + options.json.devices[0].entity_name,
                method: 'GET',
                responseType: 'json',
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                }
            };

            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', options.json.devices[0].entity_name);
        });

        it('Should process correctly active attributes represented in CBOR model', async function () {
            const rawJSONPayload = {
                barometric_pressure_0: 0,
                digital_in_3: 100,
                digital_out_4: 0,
                relative_humidity_2: 0,
                temperature_1: 27.2
            };

            const optionsCB = {
                url: 'http://' + orionServer + '/v2/entities/' + options.json.devices[0].entity_name,
                method: 'GET',
                responseType: 'json',
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                }
            };

            const attributesExample = utils.readExampleFile('./test/activeAttributes/emptyCbor.json');
            attributesExample.payload_raw = null;
            attributesExample.payload_fields = rawJSONPayload;
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish(
                options.json.devices[0].internal_attributes.lorawan.application_id +
                    '/devices/' +
                    options.json.devices[0].device_id +
                    '/up',
                JSON.stringify(attributesExample)
            );
            await utils.delay(500);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', options.json.devices[0].entity_name);
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 27.2);
            client.end();
        });
    });

    describe('Active attributes are reported using attributes alias', function () {
        it('Should process correctly active attributes', async function () {
            const optionsCB = {
                url: 'http://' + orionServer + '/v2/entities/LORA-N-003',
                method: 'GET',
                responseType: 'json',
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                }
            };
            const rawJSONPayload = {
                bp0: 0,
                dg3: 100,
                do4: 0,
                rh2: 0,
                t1: 27.2
            };

            const attributesExample = utils.readExampleFile('./test/activeAttributes/emptyCbor.json');
            attributesExample.payload_fields = rawJSONPayload;
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish('ari_ioe_app_demo1/devices/lora_n_003/up', JSON.stringify(attributesExample));
            await utils.delay(500);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', 'LORA-N-003');
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 27.2);
            await client.end();
        });
    });
});
