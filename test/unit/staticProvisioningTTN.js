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

const got = require('got');
const iotAgentConfig = require('../config-test.js');
const utils = require('../utils');
const iotagentLora = require('../../');
const iotAgentLib = require('iotagent-node-lib');
const mqtt = require('async-mqtt');
const { promisify } = require('util');
require('chai/register-should');

describe('Static provisioning', function () {
    let testMosquittoHost = 'localhost';
    let orionHost = iotAgentConfig.iota.contextBroker.host;
    let orionPort = iotAgentConfig.iota.contextBroker.port;
    let orionServer = orionHost + ':' + orionPort;
    const service = 'smartgondor';
    const subservice = '/gardens';
    readEnvVariables();
    const newConf = JSON.parse(JSON.stringify(iotAgentConfig));

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

        if (process.env.TEST_MONGODB_HOST) {
            iotAgentConfig.iota.mongodb.host = process.env.TEST_MONGODB_HOST;
        }
    }

    beforeEach(async function () {
        await utils.deleteEntityCB(
            iotAgentConfig.iota.contextBroker,
            service,
            subservice,
            'lora_unprovisioned_device:LoraDeviceGroup'
        );
    });

    afterEach(async function () {
        await promisify(iotAgentLib.clearAll)();
        try {
            await iotagentLora.stop();
        } catch (e) {
            /* Server not running */
        }
        await utils.deleteEntityCB(
            iotAgentConfig.iota.contextBroker,
            service,
            subservice,
            'lora_unprovisioned_device:LoraDeviceGroup'
        );
    });

    describe('When a new type is provisioned without LoRaWAN configuration', function () {
        it('Should start the agent without error', async function () {
            const sensorType = {
                service: 'factory',
                subservice: '/robots',
                attributes: [
                    {
                        name: 'Battery',
                        type: 'number'
                    }
                ]
            };

            newConf.iota.types.Robot = sensorType;
            await iotagentLora.start(newConf);
        });
    });

    describe('When a new type is provisioned with LoRaWAN configuration', function () {
        let devId;
        let cbEntityName;
        let sensorType;
        let optionsCB;
        it('Should start the agent without error', async function () {
            sensorType = {
                service: 'factory',
                subservice: '/robots',
                attributes: [
                    {
                        object_id: 'bp0',
                        name: 'barometric_pressure_0',
                        type: 'hpa'
                    },
                    {
                        object_id: 'di3',
                        name: 'digital_in_3',
                        type: 'Number'
                    },
                    {
                        object_id: 'do4',
                        name: 'digital_out_4',
                        type: 'Number'
                    },
                    {
                        object_id: 'rh2',
                        name: 'relative_humidity_2',
                        type: 'Number'
                    },
                    {
                        object_id: 't1',
                        name: 'temperature_1',
                        type: 'Number'
                    }
                ],
                internalAttributes: {
                    lorawan: {
                        application_server: {
                            host: 'localhost',
                            username: 'ari_ioe_app_demo1',
                            password: 'ttn-account-v2.UitfM5cPazqW52_zbtgUS6wM5vp1MeLC9Yu-Cozjfp0',
                            provider: 'TTN'
                        },
                        app_eui: '70B3D57ED000985F',
                        application_id: 'ari_ioe_app_demo1',
                        application_key: '9BE6B8EF16415B5F6ED4FBEAFE695C49'
                    }
                }
            };

            devId = 'lora_n_003';
            const type = 'Robot';
            cbEntityName = devId + ':' + type;
            optionsCB = {
                url: 'http://' + orionServer + '/v2/entities/' + cbEntityName,
                method: 'GET',
                responseType: 'json',
                headers: {
                    'fiware-service': sensorType.service,
                    'fiware-servicepath': sensorType.subservice
                }
            };

            if (testMosquittoHost) {
                sensorType.internalAttributes.lorawan.application_server.host = testMosquittoHost;
            }

            newConf.iota.types[type] = sensorType;

            await iotagentLora.start.bind(iotagentLora, newConf)();
        });

        it('Should register correctly new devices for the type and process their active attributes', async function () {
            await iotagentLora.start(newConf);
            const attributesExample = utils.readExampleFile('./test/activeAttributes/cayenneLpp.json');
            attributesExample.dev_id = devId;
            const client = await mqtt.connectAsync('mqtt://' + testMosquittoHost);
            await client.publish(
                sensorType.internalAttributes.lorawan.application_id + '/devices/' + devId + '/up',
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
    });

    describe('When a new type is provisioned with LoRaWAN configuration but the application server has been already used for other type', function () {
        it('Should not start the agent', async function () {
            const sensorType = {
                service: 'factory',
                subservice: '/robots',
                attributes: [
                    {
                        name: 'Battery',
                        type: 'number'
                    }
                ],
                internalAttributes: {
                    lorawan: {
                        application_server: {
                            host: 'localhost',
                            username: 'ari_ioe_app_demo1',
                            password: 'ttn-account-v2.UitfM5cPazqW52_zbtgUS6wM5vp1MeLC9Yu-Cozjfp0',
                            provider: 'TTN'
                        },
                        app_eui: '70B3D57ED000985F',
                        application_id: 'ari_ioe_app_demo1',
                        application_key: '9BE6B8EF16415B5F6ED4FBEAFE695C49'
                    }
                }
            };

            newConf.iota.types.Robot2 = sensorType;
            try {
                await iotagentLora.start(newConf);
            } catch (e) {
                return;
            }
            throw new Error('The IoT agent should fail to start');
        });
    });
});
