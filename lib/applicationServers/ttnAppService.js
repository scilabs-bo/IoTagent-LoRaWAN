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

const winston = require('winston');
const { AbstractAppService } = require('./abstractAppService');
const { MqttClient } = require('../bindings/mqttClient');

/**
 *Class that represents a TTN LoRaWAN app server
 */
class TTNAppService extends AbstractAppService {
    /**
     * Constructs the object.
     *
     * @param      {String}  applicationServer  The application server
     * @param      {String}  appEui             The application eui
     * @param      {String}  applicationId      The application identifier
     * @param      {String}  applicationKey     The application key
     * @param      {Function}  messageHandler     The message handler
     * @param      {String}  dataModel     The data model
     * @param      {Object}  iotaConfiguration     The IOTA configuration associated to this Application Server.
     */
    constructor(
        applicationServer,
        appEui,
        applicationId,
        applicationKey,
        messageHandler,
        dataModel,
        iotaConfiguration
    ) {
        if (!applicationId) {
            throw new Error('applicationId is mandatory for TTN');
        }

        super(applicationServer, appEui, applicationId, applicationKey, messageHandler, dataModel, iotaConfiguration);
    }

    /**
     * It starts the TTN Application Service interface
     *
     */
    async start() {
        this.preProcessMessage = this.preProcessMessage.bind(this);
        this.mqttClient = new MqttClient(
            this.applicationServer.host,
            this.applicationServer.username,
            this.applicationServer.password,
            this.preProcessMessage
        );

        await this.mqttClient.start();
    }

    /**
     * It stops the TTN Application Service interface
     *
     */
    async stop() {
        await this.stopObserveAllDevices();
        await this.mqttClient.stop();
    }

    /**
     * It processes a message received from a TTN Application Service
     *
     * @param      {<type>}  mqttTopic  The mqtt topic
     * @param      {<type>}  message    The message
     */
    preProcessMessage(mqttTopic, message) {
        winston.info('New message in topic %s', mqttTopic);
        const splittedMqttTopic = mqttTopic.split('/');
        if (splittedMqttTopic.length !== 4) {
            const errorMessage = 'Bad format for a TTN topic';
            winston.error(errorMessage);
        } else {
            // var appId = splittedMqttTopic[0];
            const deviceId = splittedMqttTopic[2];
            try {
                message = JSON.parse(message);
            } catch (e) {
                winston.error('Error decoding message: ' + e);
                message = null;
                return;
            }

            const dataModel = this.getDataModel(deviceId, null);
            const deviceEui = message.hardware_serial;
            if (dataModel === 'application_server' && typeof message.payload_fields === 'object') {
                this.messageHandler(this, deviceId, deviceEui, message.payload_fields);
            } else if (typeof message.payload_raw === 'string') {
                this.messageHandler(this, deviceId, deviceEui, message.payload_raw);
            } else {
                this.messageHandler(this, deviceId, deviceEui, null);
            }
        }
    }

    /**
     * It observes a new device. Abstract method
     *
     * @param      {string}  devId         The development identifier
     * @param      {String}  _devEUI         The development identifier
     * @param      {<type>}  _deviceObject  The device object
     */
    async observeDevice(devId, _devEUI, _deviceObject) {
        const mqttTopic = `${this.applicationId}/devices/${devId}/up`;
        await this.mqttClient.subscribeTopic(mqttTopic);
        winston.info('MQTT topic subscribed: %s', mqttTopic);
    }

    /**
     * It stops observing a device. Abstract method
     *
     * @param      {string}  devId         The development identifier
     * @param      {String}  _devEUI         The development identifier
     * @param      {<type>}  _deviceObject  The device object
     */
    async stopObservingDevice(devId, _devEUI, _deviceObject) {
        const mqttTopic = `${this.applicationId}/devices/${devId}/up`;
        await this.mqttClient.unsubscribeTopic(mqttTopic);
        winston.info('MQTT topic unsubscribed: %s', mqttTopic);
    }

    /**
     * It observes all devices
     */
    async observeAllDevices() {
        const mqttTopic = `${this.applicationId}/devices/+/up`;
        await this.mqttClient.subscribeTopic(mqttTopic);
        winston.info('MQTT topic subscribed: %s', mqttTopic);
    }

    /**
     * It stops observing all devices.
     */
    async stopObserveAllDevices() {
        const mqttTopic = `${this.applicationId}/devices/+/up`;
        await this.mqttClient.unsubscribeTopic(mqttTopic);
        winston.info('MQTT topic unsubscribed: %s', mqttTopic);
    }
}

exports.TTNAppService = TTNAppService;
