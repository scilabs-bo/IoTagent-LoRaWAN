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
 *Class that represents a ChirpStack LoRaWAN app server
 */
class ChirpStackService extends AbstractAppService {
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
            throw new Error('applicationId is mandatory for ChirpStack');
        }

        super(applicationServer, appEui, applicationId, applicationKey, messageHandler, dataModel, iotaConfiguration);
    }

    /**
     * It starts the ChirpStack Application Service interface
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
     * It stops the ChirpStack Application Service interface
     *
     */
    async stop() {
        await this.stopObserveAllDevices();
        await this.mqttClient.stop();
    }

    /**
     * It processes a message received from a ChirpStack Application Service
     *
     * @param      {<type>}  mqttTopic  The mqtt topic
     * @param      {<type>}  message    The message
     */
    preProcessMessage(mqttTopic, message) {
        winston.info('New message in topic %s', mqttTopic);
        const splittedMqttTopic = mqttTopic.split('/');
        if (splittedMqttTopic.length < 5 || splittedMqttTopic.length > 6) {
            const errorMessage = 'Bad format for a ChirpStack topic';
            winston.error(errorMessage);
        } else {
            // var appId = splittedMqttTopic[1];
            const devEui = splittedMqttTopic[3];
            const device = this.getDeviceByEui(devEui);
            try {
                message = JSON.parse(message);
            } catch (e) {
                winston.error('Error decoding message: ' + e);
                return;
            }

            const dataModel = this.getDataModel(null, devEui);
            let deviceId;
            if (device) {
                deviceId = device.id;
            } else {
                deviceId = message.deviceName;
            }
            // "json" event format
            if (dataModel === 'application_server' && typeof message.objectJSON === 'string') {
                // We can expect objectJSON to be valid JSON (as the name suggests)
                this.messageHandler(this, deviceId, devEui, JSON.parse(message.objectJSON));
            }
            // Deprecated "json_v3" event format
            else if (dataModel === 'application_server' && typeof message.object === 'object') {
                this.messageHandler(this, deviceId, devEui, message.object);
            } else if (dataModel !== 'application_server' && typeof message.data === 'string') {
                this.messageHandler(this, deviceId, message.devEUI, message.data);
            } else {
                this.messageHandler(this, deviceId, devEui, null);
            }
        }
    }

    /**
     * It observes a new device. Abstract method
     *
     * @param      {string}  _devId         The development identifier
     * @param      {String}  devEUI         The development identifier
     * @param      {<type>}  _deviceObject  The device object
     */
    async observeDevice(_devId, devEUI, _deviceObject) {
        if (!devEUI) {
            throw new Error('Missing mandatory configuration attribute for ChirpStack: dev_eui');
        }
        const mqttTopic = `application/${this.applicationId}/device/${devEUI.toLowerCase()}/event/up`;
        // ChirpStack changed its MQTT topics with v3.11.0 - keep the legacy topic for backwards compatibility
        const legacyMqttTopic = `application/${this.applicationId}/device/${devEUI.toLowerCase()}/rx`;
        await this.mqttClient.subscribeTopic(mqttTopic);
        await this.mqttClient.subscribeTopic(legacyMqttTopic);
        winston.info('MQTT topic subscribed: %s', mqttTopic);
        winston.info('Legacy (ChirpStack < v3.11.0) MQTT topic subscribed: %s', legacyMqttTopic);
    }

    /**
     * It stops observing a device. Abstract method
     *
     * @param      {string}  _devId         The development identifier
     * @param      {String}  devEUI         The development identifier
     * @param      {<type>}  _deviceObject  The device object
     */
    async stopObservingDevice(_devId, devEUI, _deviceObject) {
        const mqttTopic = `application/${this.applicationId}/device/${devEUI.toLowerCase()}/event/up`;
        const legacyMqttTopic = `application/${this.applicationId}/device/${devEUI.toLowerCase()}/rx`;
        await this.mqttClient.unsubscribeTopic(mqttTopic);
        await this.mqttClient.unsubscribeTopic(legacyMqttTopic);
        winston.info('MQTT topic unsubscribed: %s', mqttTopic);
        winston.info('Legacy (ChirpStack < v3.11.0) MQTT topic unsubscribed: %s', legacyMqttTopic);
    }

    /**
     * It observes all devices
     */
    async observeAllDevices() {
        const mqttTopic = `application/${this.applicationId}/device/+/event/up`;
        const legacyMqttTopic = `application/${this.applicationId}/device/+/rx`;
        await this.mqttClient.subscribeTopic(mqttTopic);
        await this.mqttClient.subscribeTopic(legacyMqttTopic);
        winston.info('MQTT topic subscribed: %s', mqttTopic);
        winston.info('Legacy (ChirpStack < v3.11.0) MQTT topic subscribed: %s', legacyMqttTopic);
    }

    /**
     * It stops observing all devices.
     */
    async stopObserveAllDevices() {
        const mqttTopic = `application/${this.applicationId}/device/+/event/up`;
        const legacyMqttTopic = `application/${this.applicationId}/device/+/rx`;
        await this.mqttClient.unsubscribeTopic(mqttTopic);
        await this.mqttClient.unsubscribeTopic(legacyMqttTopic);
        winston.info('MQTT topic unsubscribed: %s', mqttTopic);
        winston.info('Legacy (ChirpStack < v3.11.0) MQTT topic unsubscribed: %s', legacyMqttTopic);
    }
}

exports.ChirpStackService = ChirpStackService;
