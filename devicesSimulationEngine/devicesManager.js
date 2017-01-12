/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
/*
 * Simulation Engine - devicesManager
 * - Manages multiple simulation sessions and gives interface to the simulation api (api.js)
 */
var _ = require("underscore");
var fs = require('fs-extra');
var WebSocketServer = require('ws').Server;
var appEnv = require("cfenv").getAppEnv();

var virtualCar = require("./virtualCar.js");

const TTL = (2 * 24 * 60 * 60 * 1000); //Last access time TTL set for two days

var managers = {};
module.exports.getSimulationConfig = function(architecture, simulation){
	var simulationconfig = {
			sessionID: simulation._id,
			architectureRevision: architecture._rev,
			simulationRevision: simulation._rev,
			devicesSchemas: architecture.iotArchModel.devices,
			devices: simulation.devices
	};
	return simulationconfig;
}
module.exports.createDeviceManager = function(config, server){
	managers[config.sessionID] = (managers[config.sessionID]) ?managers[config.sessionID] : new devicesManager(config, server);
	managers[config.sessionID].touch();
	return managers[config.sessionID];
};

module.exports.getStats = function(){
	var stats = {simulations: 0, devices: 0, connectedDevices: 0};
	_.each(managers, function(manager){
		stats.simulations++;
		_.each(manager.devices, function(device){
			stats.devices++;
			if(device.isConnected())
				stats.connectedDevices++;
		});
	});
	return stats;
};

module.exports.getDeviceManager = function(simulationID){
	if(managers[simulationID])
		managers[simulationID].touch();
	return managers[simulationID];
};

module.exports.terminateSimualtion = function(simulationID){
	if(managers[simulationID]){
		managers[simulationID].destroy();
		delete managers[simulationID];
	}
};

module.exports.createFromModelFiles = function(){
	var architecture = fs.readJsonSync("model/Architecture.json");
	var simulation = fs.readJsonSync("model/simulation.json");
	var config =  getSimulationConfig(architecture, simulation);
	return new devicesManager(config);
};


//GC - monitor expiration Dates
setInterval(function() {
	var now = new Date().getTime();
	_.each(managers, function(manager){
		if(manager.expirationDate < now)
			terminateSimualtion(manager.sessionID);
		else{
			_.each(manager.devices, function(device){
				if(device.deviceClient && device.deviceClient.retryCount > 10)
					device.deviceClient.retryCount = 0;
			});
		}
	});
}, 5 * 60 * 1000);




function devicesManager(config, server){
	this.architectureRevision = (config.architectureRevision) ? config.architectureRevision : "";
	this.simulationRevision = (config.simulationRevision) ? config.simulationRevision : "";
	//create web socket server
	this._server = server;
	this.sessionID = config.sessionID;
	this.webSocketServer = new WebSocketServer({ server: this._server, path : '/' + this.sessionID});
	//patch till this bug will be fixed in ws -
	//keep http server listeners for 'upgrade' and 'error' added by webSocketServer and remove them when the webSocketServer is closed
	this.wssErrorListener = _.last(this._server.listeners('error'));
	this.wssUpgradeListener = _.last(this._server.listeners('upgrade'));
	var protocol = (appEnv.isLocal) ? 'ws://' : 'wss://';
	var address = (appEnv.isLocal) ? appEnv.bind +  ':' + appEnv.port : appEnv.url.split("://")[1];
	this.webSocketServer.on('connection', _.bind(this.onClientConnection, this));
	this.wsurl = protocol + address + '/' + this.sessionID;
	//create devices
	this.devices = {};
	this.archDevices = {};
	var devicesByArch = _.groupBy(config.devices, "archDeviceGuid");
	_.each(config.devicesSchemas, function(arcDevice){
		this.addArchDevice(arcDevice);
		var deviceInstances = devicesByArch[arcDevice.guid];
		_.each(deviceInstances, function(deviceInstance){
			if(deviceInstance.iotFCredentials){
				this.addDevice(deviceInstance);
			}
			else
				console.error("Unregistered device instance " + deviceInstance.guid)
		}, this);
	}, this);

	this.touch();
};



devicesManager.prototype.touch = function(){
	this.expirationDate = new Date().getTime() + TTL;
}

devicesManager.prototype.updateArchDevice = function(archDevice, ws){
	if(!this.archDevices[archDevice.guid]){
		console.error("Unknown architecture device" + archDevice.guid);
		if(ws)
			ws.send(JSON.stringify({error: "Unknown architecture device" + _.escape(archDevice.guid)}));
		return;
	}

	archDevice = cleanupArchElement(archDevice);
	var devicesByArch = _.groupBy(this.devices, "archDeviceGuid");
	var devices = devicesByArch[archDevice.guid];
	_.each(devices, function(device){
		device.resetDeviceArch(archDevice);
	},this);
	this.archDevices[archDevice.guid] = archDevice;
	this.broadcast({messageType: "architectureDeviceUpdated", archDevice: archDevice});
};


devicesManager.prototype.addArchDevice = function(archDevice, ws){
	if(this.archDevices[archDevice.guid]){
		console.error("Architecture device already exist" + archDevice.guid);
		if(ws)
			ws.send(JSON.stringify({error: "Architecture device already exist" + _.escape(archDevice.guid)}));
		return;
	};
	archDevice = cleanupArchElement(archDevice);
	this.archDevices[archDevice.guid] = archDevice;
	this.broadcast({messageType: "newArchitectureDevice", archDevice: archDevice});
};

devicesManager.prototype.addDevice = function(deviceInstance, ws){
	if(this.devices[deviceInstance.deviceID]){
		console.error("device already exist");
		if(ws)
			ws.send(JSON.stringify({error: "device already exist: " + _.escape(deviceInstance.guid)}));
		return;
	}
	if(!this.archDevices[deviceInstance.archDeviceGuid]){
		console.error("Unknown architecture device" + archDeviceID);
		if(ws)
			ws.send(JSON.stringify({error: "Unknown architecture device" + _.escape(archDeviceID)}));
		return;
	}
	if(!deviceInstance.iotFCredentials){
		console.error("Unregistered device instance " + deviceInstance.guid);
		if(ws)
			ws.send(JSON.stringify({error: "Unregistered device instance " + _.escape(deviceInstance.guid)}));
		return;
	}
	var device = new virtualCar(this.archDevices[deviceInstance.archDeviceGuid], deviceInstance);//, /*connect=*/true)
	this.devices[device.deviceID] = device;
	this.registerDeviceEvents(device);
	this.broadcast({messageType: "newDeviceCreated", device: deviceInstance});
	return device;
};

devicesManager.prototype.deleteDevice = function(deviceId){
	if(!deviceId){
		console.error("Device already deleted deviceId: " + deviceId);
		if(ws)
			ws.send(JSON.stringify({error: "Device already deleted deviceId: " + _.escape(deviceId)}));
		return;
	}
	if(this.devices[deviceId]){
		this.devices[deviceId].destroy();
		delete this.devices[deviceId];
	}
	this.broadcast({messageType: "deviceDeleted", deviceID: deviceId});
};

devicesManager.prototype.destroy = function () {
	var devicesIDs = _.keys(this.devices);
	_.each(devicesIDs, function(deviceID){
		this.deleteDevice(deviceID);
	}, this);

	this.devices = [];
	this.broadcast({messageType: "simulationTerminated"});
	var wss = this.webSocketServer;
	delete this.webSocketServer;
	//delay the close on the connection till all clients get the message terminated
	_.delay(function(){
		wss.close();
	},2000);
	this._server.removeListener('error', this.wssErrorListener);
	this._server.removeListener('upgrade', this.wssUpgradeListener);

};

devicesManager.prototype.connectAllDevices = function () {
	_.each(this.devices, function(device){
		if(device.isConnected() == false)
			device.connect();
	});
};

devicesManager.prototype.disconnectAllDevices = function () {
	_.each(this.devices, function(device){
		if(device.isConnected())
			device.disconnect();
	});
};

devicesManager.prototype.connectDevice = function (deviceID) {
	var device = this.devices[deviceID];
	if(!device){
		console.error("cannot connect unknow device ID: " + deviceID);
	}
	if(device.isConnected() == false)
		device.connect();
};

devicesManager.prototype.disconnectDevice = function (deviceID) {
	var device = this.devices[deviceID];
	if(!device){
		console.error("cannot disconnect unknow device ID: " + deviceID);
	}else if(device.isConnected()){
		device.disconnect();
	}
};

devicesManager.prototype.setDeviceAttribute = function (deviceID, attrName, value) {
	var device = this.devices[deviceID];
	if(!device){
		console.error("cannot set attribute unknow device ID: " + deviceID);
	}
	if(device.deviceAttributes[attrName])
		device[attrName] = value;
};

devicesManager.prototype.getDeviceStatus = function (deviceID) {
	var device = this.devices[deviceID];
	if(!device){
		console.error("cannot set attribute unknow device ID: " + deviceID);
	}
	var status = {
			deviceID: deviceID,
			deviceType: device.deviceType,
			connected: device.isConnected(),
			attributes: {},
			archDeviceGuid: device.archDeviceGuid
	};

	var attributesNames = _.keys(device.deviceAttributes);
	_.each(attributesNames, function(attrName){
		status.attributes[attrName] = device[attrName];
	})
	return status;
};

devicesManager.prototype.getAllDevicesStatus = function () {
	var devicesIDs = _.keys(this.devices);
	var status = {};
	_.each(devicesIDs, function(deviceID){
		status[deviceID] = this.getDeviceStatus(deviceID);
	}, this);
	return status;
};


devicesManager.prototype.onClientConnection = function (ws) {
	this.touch();
	ws.on('message', _.bind(function (message){
		this.onClientMessage(ws, message);
	}, this));

	var status = this.getAllDevicesStatus();
	status.messageType = "devicesStatus";
	ws.send(JSON.stringify(status));
};

devicesManager.prototype.onClientMessage = function (ws, data){
	this.touch();
	if(!this.webSocketServer)
		return;
	try {
		var command = JSON.parse(data);
		if(command.deviceID && !this.devices[command.deviceID]){
			ws.send(JSON.stringify({error: "No such device : " + _.escape(command.deviceID)}));
			return;
		}
		switch (command.cmdType) {
		case 'connect':
			this.connectDevice(command.deviceID);
			break;
		case 'connectAll':
			this.connectAllDevices();
			break;
		case 'disconnect':
			this.disconnectDevice(command.deviceID);
			break;
		case 'disconnectAll':
			this.disconnectAllDevices();
			break;
		case 'setAttribute':
			this.setDeviceAttribute(command.deviceID, command.attributeName, command.attributeValue);
			break;
		case 'deviceStatus':
			var status = this.getDeviceStatus(command.deviceID);
			status.messageType = "deviceStatus";
			ws.send(JSON.stringify(status));
			break;
		case 'allDevicesStatus':
			var status = this.getAllDevicesStatus();
			status.messageType = "devicesStatus";
			ws.send(JSON.stringify(status));
			break;
		case 'addDevice':
			this.addDevice(command.simulationDevice, ws);
			break;
		case 'addArchDevice':
			this.addArchDevice(command.archDevice, ws);
			break;
		case 'updateArchDevice':
			this.updateArchDevice(command.archDevice, ws);
			break;
		case 'getArchDevices':
			var archDevices = {messageType: "architectureDevices", archDevices: this.archDevices};
			ws.send(JSON.stringify(archDevices));
			break;
		case 'deleteDevice':
			this.deleteDevice(command.deviceID);
			break;
		case "ArchirectureDevices":
			this.archDevices
		default:
			console.error("unknown client message: " + command);
			ws.send(JSON.stringify({error: "unknown command"}));
			break;
		};

	} catch (e) {
		dumpError("error on handling client message: " + JSON.stringify(command, null, 4), e);
		ws.send(JSON.stringify({error: e.message}));
	}

};

devicesManager.prototype.broadcast = function (data) {
	data = JSON.stringify(data);
	this.webSocketServer.clients.forEach(function each(client) {
		client.send(data);
	});
};

devicesManager.prototype.registerDeviceEvents = function(device){
	device.on("attributesChange" , _.bind(this.deviceAttributesChange, this));
	device.on("connected" , _.bind(this.deviceConnected, this));
	device.on("disconnected" , _.bind(this.deviceDisconnected, this));
	device.on("connectionError" , _.bind(this.deviceConnectionError, this));
	device.on("behaviorRuntimeError" , _.bind(this.deviceBehaviorRuntimeError, this));
	device.on("behaviorCodeError" , _.bind(this.deviceBehaviorCodeError, this));
};

devicesManager.prototype.deviceAttributesChange = function(device, attributesNamesValues){
	this.broadcast({messageType: "deviceAttributesChange", deviceID: device.deviceID, changedAttributes:  attributesNamesValues});
};

devicesManager.prototype.deviceConnected = function(device){
	this.broadcast({messageType: "deviceConnected", deviceID: device.deviceID});
};

devicesManager.prototype.deviceDisconnected = function(device){
	this.broadcast({messageType: "deviceDisconnected", deviceID: device.deviceID});
};

devicesManager.prototype.deviceConnectionError = function(device, err){
	this.broadcast({messageType: "deviceConnectionError", deviceID: device.deviceID, message: err.message, stack: err.stack});
};

devicesManager.prototype.deviceBehaviorCodeError = function(device, err, hookName){
	this.broadcast({messageType: "deviceBehaviorCodeError", deviceID: device.deviceID, hookName: hookName , message: err.message, stack: err.stack});
};

devicesManager.prototype.deviceBehaviorRuntimeError = function(device, err, hookName){
	this.broadcast({messageType: "deviceBehaviorRuntimeError", deviceID: device.deviceID, hookName: hookName , message: err.message, stack: err.stack});
};

function cleanupArchElement(modelElement){
	if(modelElement.specification){
		delete modelElement.specification.type;
		_.extend(modelElement, modelElement.specification);
		delete modelElement.specification;
	}
	return modelElement;
};


