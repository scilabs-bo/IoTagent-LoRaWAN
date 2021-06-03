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
const CBOR = require('cbor-sync');
const { promisify } = require('util');
require('chai/register-should');

describe('Configuration provisioning API: Provision groups', function () {
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
        await utils.deleteEntityCB(
            iotAgentConfig.iota.contextBroker,
            service,
            subservice,
            'lora_unprovisioned_device:LoraDeviceGroup'
        );
        await utils.deleteEntityCB(
            iotAgentConfig.iota.contextBroker,
            service,
            subservice,
            'lora_unprovisioned_device2:LoraDeviceGroup'
        );
        await iotagentLora.start(iotAgentConfig);
    });

    after(async function () {
        await promisify(iotAgentLib.clearAll)();
        await iotagentLora.stop();
        await utils.deleteEntityCB(
            iotAgentConfig.iota.contextBroker,
            service,
            subservice,
            'lora_unprovisioned_device:LoraDeviceGroup'
        );
        await utils.deleteEntityCB(
            iotAgentConfig.iota.contextBroker,
            service,
            subservice,
            'lora_unprovisioned_device2:LoraDeviceGroup'
        );
    });

    describe('When a configuration provisioning request with all the required data arrives to the IoT Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'POST',
            json: utils.readExampleFile('./test/groupProvisioning/provisionGroup1TTN.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };
        const devId = 'lora_unprovisioned_device';
        const cbEntityName = devId + ':' + options.json.services[0].entity_type;
        const optionsCB = {
            url: 'http://' + orionServer + '/v2/entities/' + cbEntityName,
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        if (testMosquittoHost) {
            options.json.services[0].internal_attributes.lorawan.application_server.host = testMosquittoHost;
        }

        const optionsGetService = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        it('should add the group to the list', async function () {
            let response = await got(options);
            response.should.have.property('statusCode', 201);
            response = await got(optionsGetService);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 1);
            response.body.should.have.property('services');
            response.body.services.should.have.length(1);
            response.body.services[0].should.have.property('entity_type', options.json.services[0].entity_type);
            response.body.services[0].should.have.property('_id');
        });

        it('Should register correctly new devices for the group and process their active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp.json');
            attributesExample.dev_id = devId;
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish(
                options.json.services[0].internal_attributes.lorawan.application_id + '/devices/' + devId + '/up',
                JSON.stringify(attributesExample)
            );
            await utils.delay(1000);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', cbEntityName);
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 27.2);
            await client.end();
        });

        it('Should go on processing active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp2.json');
            attributesExample.dev_id = devId;
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish(
                options.json.services[0].internal_attributes.lorawan.application_id + '/devices/' + devId + '/up',
                JSON.stringify(attributesExample)
            );
            await utils.delay(1000);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', cbEntityName);
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 21.2);
            await client.end();
        });

        it('should add the device to the devices list', async function () {
            const optionsGetDevice = {
                url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
                method: 'GET',
                responseType: 'json',
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                }
            };
            const response = await got(optionsGetDevice);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 1);
            response.body.should.have.property('devices');
            response.body.devices.should.be.an('array');
            response.body.devices.should.have.length(1);
            response.body.devices[0].should.have.property('device_id', devId);
            response.body.devices[0].should.have.property('internal_attributes');
            response.body.devices[0].internal_attributes.should.be.an('array');
            response.body.devices[0].internal_attributes.should.have.length(1);
            response.body.devices[0].internal_attributes[0].should.be.an('object');
            response.body.devices[0].internal_attributes[0].should.have.property('lorawan');
            response.body.devices[0].internal_attributes[0].lorawan.should.be.an('object');
            response.body.devices[0].internal_attributes[0].lorawan.should.have.property('dev_eui', '3339343771356214');
        });
    });

    describe('When a configuration update request arrives to the IOT Agent', function () {
        const options = {
            url:
                'http://localhost:' +
                iotAgentConfig.iota.server.port +
                '/iot/services?resource=70B3D57ED000985F&apikey',
            method: 'PUT',
            json: utils.readExampleFile('./test/groupProvisioning/updateGroup1TTN.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };
        const devId = 'lora_unprovisioned_device';
        const cbEntityName = devId + ':LoraDeviceGroup';
        const optionsCB = {
            url: 'http://' + orionServer + '/v2/entities/' + cbEntityName,
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        const optionsGetService = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };
        it('should update the group in the list', async function () {
            let response = await got(options);
            response.should.have.property('statusCode', 204);
            response = await got(optionsGetService);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 1);
            response.body.should.have.property('services');
            response.body.services.should.have.length(1);
            response.body.services[0].should.have.property('_id');
            response.body.services[0].should.have.property('attributes');
            response.body.services[0].attributes.should.be.an('array');
            response.body.services[0].attributes.should.have.length(6);
        });
        it('Should go on processing active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp2.json');
            attributesExample.dev_id = devId;
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish(
                options.json.internal_attributes.lorawan.application_id + '/devices/' + devId + '/up',
                JSON.stringify(attributesExample)
            );
            await utils.delay(1000);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', cbEntityName);
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 21.2);
            await client.end();
        });
    });

    describe('After a restart', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'POST',
            json: utils.readExampleFile('./test/groupProvisioning/provisionGroup1TTN.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };
        it('Should keep on listening to devices from provisioned groups', async function () {
            const devId = 'lora_unprovisioned_device2';
            const cbEntityName = devId + ':' + options.json.services[0].entity_type;
            const optionsCB = {
                url: 'http://' + orionServer + '/v2/entities/' + cbEntityName,
                method: 'GET',
                responseType: 'json',
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                }
            };
            await iotagentLora.stop();
            await iotagentLora.start(iotAgentConfig);
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp3.json');
            attributesExample.dev_id = devId;
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish(
                options.json.services[0].internal_attributes.lorawan.application_id + '/devices/' + devId + '/up',
                JSON.stringify(attributesExample)
            );
            await utils.delay(1000);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', cbEntityName);
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 28);
            await client.end();
        });
    });

    describe('When a configuration provisioning request with all the required data arrives to the IoT Agent. CBOR data model', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'POST',
            json: utils.readExampleFile('./test/groupProvisioning/provisionGroup1TTNCbor.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };
        const devId = 'lora_unprovisioned_device3';
        const cbEntityName = devId + ':' + options.json.services[0].entity_type;
        const optionsCB = {
            url: 'http://' + orionServer + '/v2/entities/' + cbEntityName,
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        if (testMosquittoHost) {
            options.json.services[0].internal_attributes.lorawan.application_server.host = testMosquittoHost;
        }

        const optionsGetService = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        it('should add the group to the list', async function () {
            let response = await got(options);
            response.should.have.property('statusCode', 201);
            response = await got(optionsGetService);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 2);
            response.body.should.have.property('services');
            response.body.services.should.have.length(2);
            response.body.services[1].should.have.property('entity_type', options.json.services[0].entity_type);
            response.body.services[1].should.have.property('_id');
        });

        it('Should register correctly new devices for the group and process their active attributes', async function () {
            const rawJSONPayload = {
                barometric_pressure_0: 0,
                digital_in_3: 100,
                digital_out_4: 0,
                relative_humidity_2: 0,
                temperature_1: 27.2
            };

            const encodedBuffer = CBOR.encode(rawJSONPayload);
            const attributesExample = utils.readExampleFile('./test/activeAttributes/emptyCbor.json');
            attributesExample.payload_raw = encodedBuffer.toString('base64');
            attributesExample.dev_id = devId;
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish(
                options.json.services[0].internal_attributes.lorawan.application_id + '/devices/' + devId + '/up',
                JSON.stringify(attributesExample)
            );
            await utils.delay(1000);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', cbEntityName);
            response.body.should.have.property('barometric_pressure_0');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 27.2);
            await client.end();
        });
    });
    describe('When a group delete request arrives to the Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services/',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            },
            method: 'DELETE',
            responseType: 'json',
            searchParams: {
                resource: '70B3D57ED000985F',
                apikey: ''
            }
        };

        const optionsGetService = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/services',
            method: 'GET',
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            }
        };

        it('should return a 204 OK and no errors', async function () {
            const response = await got(options);
            response.should.have.property('statusCode', 204);
        });

        it('should remove the group from the provisioned groups list', async function () {
            const response = await got(optionsGetService);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 1);
        });

        it('Should unsuscribe from the corresponding MQTT topic', async function () {
            const optionsCB = {
                url: 'http://' + orionServer + '/v2/entities/LORA-N-005',
                method: 'GET',
                responseType: 'json',
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                },
                throwHttpErrors: false
            };
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp.json');
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish('ari_ioe_app_demo1/devices/LORA-N-005/up', JSON.stringify(attributesExample));
            await utils.delay(500);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 404);
            await client.end();
        });
    });
});
