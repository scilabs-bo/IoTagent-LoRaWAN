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

const iotAgentLib = require('iotagent-node-lib');
const confService = require('iotagent-node-lib/lib/services/groups/groupService');
const winston = require('winston');
const config = require('./configService');
const { TTNAppService } = require('./applicationServers/ttnAppService');
const { ChirpStackService } = require('./applicationServers/chirpStackAppService');
const { TTNv3AppService } = require('./applicationServers/ttnV3AppService');
const dataTranslation = require('./dataTranslationService');
const { promisify, callbackify } = require('util');
const { default: AwaitLock } = require('await-lock');

let loraApps = [];
/**
 *  This lock is acquired when the array loraApps is about to be accessed. This protects the IoT agent from race conditions when async methods change loraApps.
 **/
const loraAppsLock = new AwaitLock();

/**
 * Loads a cofiguration.
 *
 * @param      {<type>}    appServer  The application server
 */
async function loadConfigurationFromAppserver(appServer) {
    const conf = appServer.getIotaConfiguration();
    if (!conf || conf.resource) {
        return await promisify(iotAgentLib.getConfiguration)(appServer.getAppId(), '');
    }
    return conf;
}

/**
 * Get an application server using device group parameters
 * @param  {String} service Device group's service
 * @param  {String} subservice Device group's subservice
 * @param  {String} apikey Device group's apikey
 * @param  {String} resource Device group's resource
 */
function getAppByDeviceGroup(service, subservice, apikey, resource) {
    /* No lock acquisition necessary as the lock is acquired in the calling method */
    return (
        loraApps.find((app) => {
            const iotaConf = app.getIotaConfiguration();
            return (
                iotaConf &&
                iotaConf.service === service &&
                iotaConf.subservice === subservice &&
                iotaConf.apikey === apikey &&
                iotaConf.resource === resource
            );
        }) || null
    );
}

/**
 * Removes an application server using device group parameters
 *
 * @param  {String} service Device group's service
 * @param  {String} subservice Device group's subservice
 * @param  {String} apikey Device group's apikey
 * @param  {String} resource Device group's resource
 */
function removeAppByDeviceGroup(service, subservice, apikey, resource) {
    /* No lock acquisition necessary as the lock is acquired in the calling method */
    loraApps = loraApps.filter((app) => {
        const iotaConf = app.getIotaConfiguration();
        return !(
            iotaConf &&
            iotaConf.service === service &&
            iotaConf.subservice === subservice &&
            iotaConf.apikey === apikey &&
            iotaConf.resource === resource
        );
    });
}

/**
 * It handles new messages comming from the LoRaWAN application servers
 *
 * @param      {Object}  appServer  The application server
 * @param      {string}  deviceId   The device identifier
 * @param      {string}  deviceEui  The device EUI
 * @param      {Object}  message    The message
 */
async function messageHandler(appServer, deviceId, deviceEui, message) {
    let errorMessage;
    if (!appServer) {
        errorMessage = 'Message handler received empty app object';
        winston.error(errorMessage);
        return;
    }

    if (!deviceId) {
        errorMessage = 'Message handler received empty deviceId';
        winston.error(errorMessage);
        return;
    }

    const deviceObject = appServer.getDevice(deviceId);
    let device;

    if (!deviceObject) {
        winston.info('LoRaWAN device unprovisioned');
        winston.debug('Looking for group:' + appServer.getAppId());
        try {
            const configuration = await loadConfigurationFromAppserver(appServer);
            device = await registerDeviceFromConfiguration(deviceId, deviceEui, configuration);
        } catch (e) {
            winston.error(e);
            return;
        }
        if (!device) {
            errorMessage = 'Unexpected error';
            winston.error(errorMessage);
            return;
        }

        await appServer.addDevice(device.id, deviceEui, device);
        const ngsiMessage = dataTranslation.toNgsi(message, device);
        if (ngsiMessage && ngsiMessage instanceof Array && ngsiMessage.length > 0) {
            try {
                await promisify(iotAgentLib.update)(device.name, device.type, '', ngsiMessage, device);
                winston.info('Observations sent to CB successfully for device ', deviceId);
            } catch (e) {
                errorMessage = "Couldn't send the updated values to the Context Broker due to an error:";
                winston.error(errorMessage, JSON.stringify(e));
            }
        } else {
            errorMessage = 'Could not cast message to NGSI';
            winston.error(errorMessage);
        }
    } else {
        try {
            device = await promisify(iotAgentLib.getDevice)(deviceId, deviceObject.service, deviceObject.subservice);
        } catch (e) {
            errorMessage = 'Error getting IoTA device object';
            winston.error(errorMessage, JSON.stringify(e));
            return;
        }
        if (!device) {
            errorMessage = "Couldn't find device data for DeviceId " + deviceId;
            winston.error(errorMessage);
        }
        winston.info('IOTA provisioned devices:', JSON.stringify(device));
        const ngsiMessage = dataTranslation.toNgsi(message, device);
        if (ngsiMessage && ngsiMessage instanceof Array && ngsiMessage.length > 0) {
            try {
                await promisify(iotAgentLib.update)(device.name, device.type, '', ngsiMessage, device);
                winston.info('Observations sent to CB successfully for device ', deviceId);
            } catch (e) {
                errorMessage = "Couldn't send the updated values to the Context Broker due to an error:";
                winston.error(errorMessage, JSON.stringify(e));
            }
        } else {
            errorMessage = 'Could not cast message to NGSI';
            winston.error(errorMessage);
        }
    }
}

/**
 * It registers a new LoRaWAN application server
 *
 * @param      {Object}    appServerConf  The application server conf
 * @param      {Object}    iotaConfiguration  The IOTA configuration associated to this application server
 */
async function registerApplicationServer(appServerConf, iotaConfiguration) {
    let error;
    let deviceGroup;

    winston.info('Registering Application Server:%s', JSON.stringify(appServerConf));

    if (typeof appServerConf.lorawan !== 'object') {
        error = 'lorawan attribute must be specified inside internal_attributes';
        winston.error(error);
        throw error;
    }

    if (typeof appServerConf.lorawan.application_server !== 'object') {
        error = 'lorawan.application_server attribute must be specified inside internal_attributes';
        winston.error(error);
        throw error;
    }

    if (typeof appServerConf.lorawan.application_server.host !== 'string') {
        error = 'Host for application server is required';
        winston.error(error);
        throw error;
    }

    if (
        typeof appServerConf.lorawan.application_server.provider !== 'string' ||
        ['TTN', 'TTNv3', 'loraserver.io', 'ChirpStack'].indexOf(appServerConf.lorawan.application_server.provider) ===
            -1
    ) {
        // loraserver.io is deprecated and therefore not advertised as supported anymore
        error = 'Provider for application server is required. Supported values: TTN, TTNv3 and ChirpStack';
        winston.error(error);
        throw error;
    }

    if (typeof appServerConf.lorawan.app_eui !== 'string' || !/^[0-9A-Fa-f]{16}$/.test(appServerConf.lorawan.app_eui)) {
        error = 'Missing or invalid mandatory configuration attributes for lorawan: app_eui';
        winston.error(error);
        throw error;
    }

    if (typeof appServerConf.lorawan.application_id !== 'string') {
        error = 'Missing mandatory configuration attributes for lorawan: application_id';
        winston.error(error);
        throw error;
    }

    await loraAppsLock.acquireAsync();
    try {
        if (iotaConfiguration) {
            deviceGroup = getAppByDeviceGroup(
                iotaConfiguration.service,
                iotaConfiguration.subservice,
                iotaConfiguration.apikey,
                iotaConfiguration.resource
            );
        }

        if (
            deviceGroup &&
            Object.prototype.hasOwnProperty.call(deviceGroup.iotaConfiguration, 'apikey') &&
            Object.prototype.hasOwnProperty.call(deviceGroup.iotaConfiguration, 'resource')
        ) {
            winston.info('Updating existing device group configuration');
            removeAppByDeviceGroup(
                deviceGroup.iotaConfiguration.service,
                deviceGroup.iotaConfiguration.subservice,
                deviceGroup.iotaConfiguration.apikey,
                deviceGroup.iotaConfiguration.resource
            );
            deviceGroup.stop();
        }

        const existingApp = loraApps.find((app) => app.getAppId() === appServerConf.lorawan.app_eui);
        if (existingApp) {
            winston.info('LoRaWAN Application exists');
            if (iotaConfiguration && existingApp.getIotaConfiguration()) {
                error = 'Could not assign a new type or service to the LoRaWAN Application';
                winston.error(error);
                throw error;
            }
        }

        winston.info('Creating new LoRaWAN application');
        let newApp;
        let NewAppProvider;
        switch (appServerConf.lorawan.application_server.provider) {
            case 'TTN':
                NewAppProvider = TTNAppService;
                break;
            case 'TTNv3':
                NewAppProvider = TTNv3AppService;
                break;
            case 'ChirpStack':
            case 'loraserver.io':
                NewAppProvider = ChirpStackService;
                break;
            /* default case can not occur due to previous if condition */
        }
        try {
            newApp = new NewAppProvider(
                appServerConf.lorawan.application_server,
                appServerConf.lorawan.app_eui,
                appServerConf.lorawan.application_id,
                appServerConf.lorawan.application_key,
                messageHandler,
                appServerConf.lorawan.data_model,
                iotaConfiguration
            );
        } catch (e) {
            error = 'Error creating new LoRaWAN application';
            winston.error(error);
            throw error;
        }

        try {
            await newApp.start();
            winston.info('Application started.');
            loraApps.push(newApp);
            return newApp;
        } catch (e) {
            winston.error(e);
            error = 'Error starting App Service';
            winston.error(error);
            throw error;
        }
    } finally {
        loraAppsLock.release();
    }
}

/**
 * Stops LoRaWAN application servers
 *
 */
async function stopApplicationServers() {
    await loraAppsLock.acquireAsync();
    try {
        const loraAppsStopPromises = loraApps.map((app) => {
            winston.info('Stopping App service: %s', app.getAppId());
            return app.stop();
        });
        await Promise.all(loraAppsStopPromises);
    } finally {
        loraAppsLock.release();
    }
}

/**
 * It registers a new IOTA configuration
 *
 * @param      {Object}    configuration  The configuration
 */
async function registerConfiguration(configuration) {
    let error;

    winston.info('Configuration provisioning:%s', JSON.stringify(configuration));
    if (!configuration.internalAttributes) {
        error = 'internal_attributes is mandatory to define specific agent configuration';
        winston.error(error);
        error = { message: error };
        throw error;
    }
    let lorawanConf = {};
    if (Array.isArray(configuration.internalAttributes)) {
        for (let i = 0; i < configuration.internalAttributes.length; i++) {
            if (configuration.internalAttributes[i].lorawan) {
                lorawanConf = configuration.internalAttributes[i];
                break;
            }
        }
    } else {
        lorawanConf = configuration.internalAttributes;
    }

    try {
        const ttnApp = await registerApplicationServer(lorawanConf, configuration);
        await ttnApp.observeAllDevices();
        return configuration;
    } catch (e) {
        winston.error(e);
        error = { message: e };
        throw e;
    }
}

/**
 * It removes a new IOTA configuration
 * @param  {Object} configuration The configuration to be removed
 */
async function removeConfiguration(configuration) {
    winston.info('Removing configuration:%s', JSON.stringify(configuration));
    const lorawanConf = configuration.internalAttributes[0];
    await loraAppsLock.acquireAsync();
    try {
        const appIndex = loraApps.findIndex((loraApp) => loraApp.getAppId() === lorawanConf.lorawan.app_eui);
        if (appIndex >= 0) {
            await loraApps[appIndex].stop();
            delete loraApps[appIndex];
        }
        return configuration;
    } finally {
        loraAppsLock.release();
    }
}

/**
 * It registers a new IoTA device
 *
 * @param      {Object}    device    The device
 */
async function registerDevice(device) {
    let error;

    winston.info('Device provisioning:%s', JSON.stringify(device));

    if (!device.internalAttributes) {
        error = 'internal_attributes is mandatory to define specific agent configuration';
        winston.error(error);
        error = { message: error };
        throw error;
    }

    let lorawanConf = {};
    if (Array.isArray(device.internalAttributes)) {
        for (let i = 0; i < device.internalAttributes.length; i++) {
            if (device.internalAttributes[i].lorawan) {
                lorawanConf = device.internalAttributes[i];
                break;
            }
        }
    } else {
        lorawanConf = device.internalAttributes;
    }

    try {
        const appServer = await registerApplicationServer(lorawanConf, null);
        await appServer.addDevice(device.id, lorawanConf.lorawan.dev_eui, device);
        return device;
    } catch (e) {
        winston.error(e);
        error = { message: e };
        throw error;
    }
}

/**
 * It removes a new IoTA device
 * @param  {Object} device The device to be removed
 */
async function removeDevice(device) {
    winston.info('Removing device:%s', JSON.stringify(device));
    const lorawanConf = device.internalAttributes;
    await loraAppsLock.acquireAsync();
    try {
        const app = loraApps.find((loraApp) => loraApp.getAppId === lorawanConf.lorawan.app_eui);
        if (app) {
            await app.removeDevice(device.id, lorawanConf.lorawan.dev_eui, device);
        }
        return device;
    } finally {
        loraAppsLock.release();
    }
}

/**
 * It registers a new device using an already registered configuration
 *
 * @param      {string}    deviceId       The device identifier
 * @param      {string}    deviceEUI      The device EUI
 * @param      {Object}    configuration  The configuration
 */
async function registerDeviceFromConfiguration(deviceId, deviceEUI, configuration) {
    let newDevice = {};

    newDevice = {
        id: deviceId,
        name: deviceId + ':' + configuration.type,
        type: configuration.type,
        service: configuration.service,
        subservice: configuration.subservice,
        lazy: configuration.lazy,
        active: configuration.attributes,
        commands: configuration.commands,
        internalAttributes: configuration.internalAttributes
    };

    if (Array.isArray(newDevice.internalAttributes)) {
        for (let i = 0; i < newDevice.internalAttributes.length; i++) {
            if (newDevice.internalAttributes[i].lorawan) {
                newDevice.internalAttributes[i].lorawan.dev_eui = deviceEUI;
                break;
            }
        }
    } else {
        newDevice.internalAttributes.lorawan.dev_eui = deviceEUI;
    }

    return await promisify(iotAgentLib.register)(newDevice);
}

/**
 * Loads a types from configuration.
 *
 */
async function loadTypesFromConfig() {
    winston.info('Loading types from configuration file');
    if (config.getConfig().iota.types) {
        const registerConfigsPromises = Object.keys(config.getConfig().iota.types)
            .filter(
                (type) =>
                    config.getConfig().iota.types[type].internalAttributes &&
                    config.getConfig().iota.types[type].internalAttributes.lorawan
            )
            .map((type) => {
                return {
                    type,
                    ...config.getConfig().iota.types[type]
                };
            })
            .map(registerConfiguration);

        try {
            await Promise.all(registerConfigsPromises);
        } catch (e) {
            winston.error('Error loading services from configuration file', e);
            throw e;
        }
    }
}

/**
 * Loads services.
 *
 */
async function loadServices() {
    winston.info('Loading services from registry');
    let services;
    try {
        services = await promisify(confService.list)(null, 100, 0);
    } catch (e) {
        winston.error('Error', e);
        throw e;
    }

    if (services && Array.isArray(services.services)) {
        try {
            await Promise.all(services.services.map(registerConfiguration));
        } catch (e) {
            winston.error('Error loading services', e);
            throw e;
        }
    }
}

/**
 * Loads devices from memory. This function is used during the boostrap process
 *
 */
async function loadDevices() {
    winston.info('Loading devices from registry');
    let devices;
    try {
        devices = await promisify(iotAgentLib.listDevices)(undefined, undefined, undefined, undefined);
    } catch (e) {
        winston.error('Error', e);
        throw e;
    }

    if (devices && Array.isArray(devices.devices)) {
        try {
            await Promise.all(devices.devices.map(registerDevice));
        } catch (e) {
            winston.error('Error loading devices', e);
            throw e;
        }
    }
}

/**
 * Starts the IoT Agent
 *
 * @param      {<type>}    newConfig  The new configuration
 */
async function start(newConfig) {
    config.setConfig(newConfig);
    await promisify(iotAgentLib.activate)(config.getConfig().iota);
    winston.info('iotagent-node-lib activated');
    iotAgentLib.setProvisioningHandler(callbackify(registerDevice));
    iotAgentLib.setRemoveDeviceHandler(callbackify(removeDevice));
    iotAgentLib.setConfigurationHandler(callbackify(registerConfiguration));
    iotAgentLib.setRemoveConfigurationHandler(callbackify(removeConfiguration));

    // Enables all the plugins
    iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.attributeAlias.update);
    iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.addEvents.update);
    iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.expressionTransformation.update);
    iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.multiEntity.update);
    iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.timestampProcess.update);

    iotAgentLib.addDeviceProvisionMiddleware(iotAgentLib.dataPlugins.bidirectionalData.deviceProvision);
    iotAgentLib.addConfigurationProvisionMiddleware(iotAgentLib.dataPlugins.bidirectionalData.groupProvision);
    iotAgentLib.addNotificationMiddleware(iotAgentLib.dataPlugins.bidirectionalData.notification);

    try {
        await loadTypesFromConfig();
        await loadServices();
        await loadDevices();
    } catch (e) {
        winston.error(e);
        throw e;
    }
}

/**
 * Stops the IoT Agent
 *
 */
async function stop() {
    winston.info('Stopping IoT Agent');
    try {
        await stopApplicationServers();
        await promisify(iotAgentLib.resetMiddlewares)();
        await promisify(iotAgentLib.deactivate)();
    } catch (e) {
        winston.error(e);
        throw e;
    }
    await loraAppsLock.acquireAsync();
    loraApps = [];
    loraAppsLock.release();
    winston.info('Agent stopped');
}

exports.start = start;
exports.stop = stop;
