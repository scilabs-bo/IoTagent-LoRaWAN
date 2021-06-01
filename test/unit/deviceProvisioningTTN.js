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

describe('Device provisioning API: Provision devices', function () {
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
        await promisify(iotagentLora.start.bind(iotagentLora, iotAgentConfig))();
    });

    after(async function () {
        await promisify(iotAgentLib.clearAll)();
        await promisify(iotagentLora.stop)();
        await utils.deleteEntityCB(iotAgentConfig.iota.contextBroker, service, subservice, 'LORA-N-003');
        await utils.deleteEntityCB(iotAgentConfig.iota.contextBroker, service, subservice, 'LORA-N-001');
    });

    describe('When a device provisioning request without internalAttributes arrives at the IoT Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provisionDeviceTTN_noInternalAttributes.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            },
            throwHttpErrors: false
        };

        it('should answer with error', async function () {
            const response = await got(options);
            response.should.have.property('statusCode', 500);
        });
    });

    describe('When a device provisioning request without lorawan property arrives at the IoT Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provisionDeviceTTN_noLorawan.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            },
            throwHttpErrors: false
        };

        it('should answer with error', async function () {
            const response = await got(options);
            response.should.have.property('statusCode', 500);
        });
    });

    describe('When a device provisioning request without application_server property arrives at the IoT Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provisionDeviceTTN_noApplicationServer.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            },
            throwHttpErrors: false
        };

        it('should answer with error', async function () {
            const response = await got(options);
            response.should.have.property('statusCode', 500);
        });
    });

    describe('When a device provisioning request without application_server host property arrives at the IoT Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provisionDeviceTTN_noApplicationServerHost.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            },
            throwHttpErrors: false
        };

        it('should answer with error', async function () {
            const response = await got(options);
            response.should.have.property('statusCode', 500);
        });
    });

    describe('When a device provisioning request without application_server provider property arrives at the IoT Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile(
                './test/deviceProvisioning/provisionDeviceTTN_noApplicationServerProvider.json'
            ),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            },
            throwHttpErrors: false
        };

        it('should answer with error', async function () {
            const response = await got(options);
            response.should.have.property('statusCode', 500);
        });
    });

    describe('When a device provisioning request without mandatory properties arrives at the IoT Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provisionDeviceTTN_noMandatoryProperties.json'),
            responseType: 'json',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            },
            throwHttpErrors: false
        };

        it('should answer with error', async function () {
            const response = await got(options);
            response.should.have.property('statusCode', 500);
        });
    });

    describe('When a device provisioning request with all the required data arrives to the IoT Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provisionDevice1TTN.json'),
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
            let response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', options.json.devices[0].entity_name);
        });

        it('Should process correctly active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp.json');
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
            await client.end();
        });
    });

    describe('When a device provisioning request with all the required data arrives to the IoT Agent and the Application Server already exists', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
            method: 'POST',
            json: utils.readExampleFile('./test/deviceProvisioning/provisionDevice2TTN.json'),
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
            await utils.delay(500);
            response = await got(optionsGetDevice);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 2);
            response.body.should.have.property('devices');
            response.body.devices.should.be.an('array');
            response.body.devices.should.have.length(2);
            response.body.devices[1].should.have.property('device_id', options.json.devices[0].device_id);
        });

        it('should register the entity in the CB', async function () {
            let response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', options.json.devices[0].entity_name);
        });

        it('Should process correctly active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp2.json');
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
            response.body.temperature_1.should.have.property('value', 21.2);
            await client.end();
        });
    });

    describe('Active attributes are reported but bad payload is received', function () {
        it('Should process correctly active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp_bad_json.json', true);
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish('ari_ioe_app_demo1/devices/lora_n_003/up', JSON.stringify(attributesExample));
            await utils.delay(500);
            await client.end();
        });

        it('Should process correctly active attributes', async function () {
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp_bad_raw.json', true);
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish('ari_ioe_app_demo1/devices/lora_n_003/up', JSON.stringify(attributesExample));
            await utils.delay(500);
            await client.end();
        });
    });

    describe('After a restart', function () {
        it('Should keep on listening to active attributes from provisioned devices', async function () {
            const optionsCB = {
                url: 'http://' + orionServer + '/v2/entities/LORA-N-003',
                method: 'GET',
                responseType: 'json',
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                }
            };
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp3.json');
            await promisify(iotagentLora.stop)();
            await promisify(iotagentLora.start.bind(iotagentLora, iotAgentConfig))();
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish('ari_ioe_app_demo1/devices/lora_n_003/up', JSON.stringify(attributesExample));
            await utils.delay(500);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', 'LORA-N-003');
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 28);
            await client.end();
        });
    });

    describe('When a device delete request arrives to the Agent', function () {
        const options = {
            url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices/lora_n_003',
            headers: {
                'fiware-service': service,
                'fiware-servicepath': subservice
            },
            responseType: 'json',
            method: 'DELETE'
        };

        it('should return a 204 OK and no errors', async function () {
            const response = await got(options);
            response.should.have.property('statusCode', 204);
        });

        it('should remove the device from the provisioned devices list', async function () {
            const response = await got({
                url: 'http://localhost:' + iotAgentConfig.iota.server.port + '/iot/devices',
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                },
                responseType: 'json',
                method: 'GET'
            });
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('count', 1);
            response.body.should.have.property('devices');
            response.body.devices.should.have.length(1);
        });

        it('Should unsuscribe from the corresponding MQTT topic', async function () {
            const optionsCB = {
                url: 'http://' + orionServer + '/v2/entities/LORA-N-003',
                method: 'GET',
                responseType: 'json',
                headers: {
                    'fiware-service': service,
                    'fiware-servicepath': subservice
                }
            };
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp.json');
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish('ari_ioe_app_demo1/devices/LORA-N-003/up', JSON.stringify(attributesExample));
            await utils.delay(500);
            const response = await got(optionsCB);
            response.should.have.property('statusCode', 200);
            response.body.should.have.property('id', 'LORA-N-003');
            response.body.should.have.property('temperature_1');
            response.body.temperature_1.should.be.an('object');
            response.body.temperature_1.should.have.property('type', 'Number');
            response.body.temperature_1.should.have.property('value', 28);
            await client.end();
        });
    });
});
