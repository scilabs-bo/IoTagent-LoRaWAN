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
const iotagentLora = require('../../lib/iotagent-lora');
const iotAgentLib = require('iotagent-node-lib');
const mqtt = require('async-mqtt');
const { promisify } = require('util');
require('chai/register-should');

describe('Device provisioning API: Provision devices (ChirpStack < v3.11.0)', function () {
    let testMosquittoHost = 'localhost';
    let orionHost = iotAgentConfig.iota.contextBroker.host;
    let orionPort = iotAgentConfig.iota.contextBroker.port;
    let orionServer = orionHost + ':' + orionPort;
    const service = 'smartgondor';
    const subservice = '/gardens';

    readEnvVariables();

    function readEnvVariables() {
        if (process.env.TEST_MOSQUITTO_HOST) {
            testMosquittoHost = process.env.TEST_MOSQUITTO_HOST;
        }

        if (process.env.IOTA_CB_HOST) {
            orionHost = process.env.IOTA_CB_HOST;
        }

        if (process.env.IOTA_CB_PORT) {
            orionPort = process.env.IOTA_CB_PORT;
        }

        orionServer = orionHost + ':' + orionPort;
    }

    before(async function () {
        await utils.deleteEntityCB(iotAgentConfig.iota.contextBroker, service, subservice, 'LORA-N-003');
        await utils.deleteEntityCB(iotAgentConfig.iota.contextBroker, service, subservice, 'LORA-N-001');
        await iotagentLora.start(iotAgentConfig);
    });

    after(async function () {
        await promisify(iotAgentLib.clearAll)();
        await iotagentLora.stop();
        await utils.deleteEntityCB(iotAgentConfig.iota.contextBroker, service, subservice, 'LORA-N-003');
        await utils.deleteEntityCB(iotAgentConfig.iota.contextBroker, service, subservice, 'LORA-N-001');
    });

    describe('When a device provisioning request with all the required data arrives to the IoT Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provision_device_chirpStack_1.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        if (testMosquittoHost) {
            options.json.devices[0].internal_attributes.lorawan.application_server.host = testMosquittoHost;
        }

        const optionsGetDevice = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
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

        it('should add the device to the devices list', async function () {
            let response = await got(options);
            response.should.have.property('statusCode', 201);
            response = await got(optionsGetDevice);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 1);
            response.body.should.have.property('devices');
            response.body.devices.should.be.an('array');
            response.body.devices.should.have.length(1);
            response.body.devices[0].should.have.property('device_id', options.json.devices[0].device_id);
        });

        it('should register the entity in the CB', async function () {
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', options.json.devices[0].entity_name);
        });

        it('Should process correctly active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp_chirpStack_1.json');
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish(
                'application/' +
                    options.json.devices[0].internal_attributes.lorawan.application_id +
                    '/device/' +
                    options.json.devices[0].internal_attributes.lorawan.dev_eui.toLowerCase() +
                    '/rx',
                JSON.stringify(attributesExample)
            );
            await utils.delay(500);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', options.json.devices[0].entity_name);
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 27.2);
            await client.end();
        });
    });

    describe('When a device provisioning request with all the required data arrives to the IoT Agent and the Application Server already exists', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provision_device_chirpStack_2.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        if (testMosquittoHost) {
            options.json.devices[0].internal_attributes.lorawan.application_server.host = testMosquittoHost;
        }

        const optionsGetDevice = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': 'smartgondor',
                'fiware-servicepath': '/gardens'
            }
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

        it('should add the device to the devices list', async function () {
            let response = await got(options);
            response.should.have.property('statusCode', 201);
            response = await got(optionsGetDevice);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 2);
            response.body.should.have.property('devices');
            response.body.devices.should.be.an('array');
            response.body.devices.should.have.length(2);
            response.body.devices[1].should.have.property('device_id', options.json.devices[0].device_id);
        });

        it('should register the entity in the CB', async function () {
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', options.json.devices[0].entity_name);
        });

        it('Should process correctly active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp_chirpStack_2.json');
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish(
                'application/' +
                    options.json.devices[0].internal_attributes.lorawan.application_id +
                    '/device/' +
                    options.json.devices[0].internal_attributes.lorawan.dev_eui.toLowerCase() +
                    '/rx',
                JSON.stringify(attributesExample)
            );
            await utils.delay(500);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', options.json.devices[0].entity_name);
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 21.2);
            await client.end();
        });
    });

    describe('Active attributes are reported but bad payload is received', function () {
        it('Should process correctly active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp_bad_json.json', true);
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish('application/1/device/3339343752356A14/rx', JSON.stringify(attributesExample));
            await utils.delay(500);
            await client.end();
        });

        it('Should process correctly active attributes', async function () {
            const attributesExample = utils.readExampleFile(
                './test/activeAttributes/cayenneLpp_bad_raw_chirpStack.json',
                true
            );
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish('application/1/device/3339343752356A14/rx', JSON.stringify(attributesExample));
            await utils.delay(500);
            await client.end();
        });
    });
});
