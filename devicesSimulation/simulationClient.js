/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
module.exports = simulationClient;
var _ = require("underscore");
var util = require('util');
var EventEmitter = require('events');
var WebSocket  = require("ws");
var uuid = require("node-uuid");
var Q = require("q");
var fs = require('fs-extra');
var request = require('request');
var appEnv = require("cfenv").getAppEnv();
var debug = require('debug')('simulationClient');
debug.log = console.log.bind(console);

function simulationClient(config) {
	if (!(this instanceof simulationClient)) {
		return new simulationClient(config);
	}
	EventEmitter.call(this);
	config = (config) ? config :{};
	
	this.simulationConfig = {
		"sessionID": (config.sessionID) ? config.sessionID :(appEnv.app.application_id || BM_APPLICATION_ID),
		"devicesSchemas": (config.devicesSchemas) ? config.devicesSchemas : [],
		"devices": (config.devices) ? config.devices : []
	};
	
	if(config.simulationConfigFile)
		this.loadConfiguration(config.simulationConfigFile, true);
	this.ws = null;
};


//Inherit functions from `EventEmitter`'s prototype
util.inherits(simulationClient, EventEmitter);

simulationClient.prototype.getDevicesSchemas = function(){
	return this.simulationConfig.devicesSchemas;
};

simulationClient.prototype.getDevices = function(){
	return this.simulationConfig.devices;
};

simulationClient.prototype.loadConfiguration= function(simulationConfigFile, registerDevicetypes){
	simulationConfigFile = (simulationConfigFile) ? simulationConfigFile: "./devicesSimulation/simulationConfig.json";
	_.extend(this.simulationConfig, fs.readJsonSync(simulationConfigFile));
	if(!registerDevicetypes)
		return Q(true);
	var regDeviceTypeReqs = [];
	_.each(this.simulationConfig.devicesSchemas, function(schema){
		var iotFClient = getIotfAppClient();
		regDeviceTypeReqs.push(iotFClient.callApi('POST', 200, true, ['device', 'types'], JSON.stringify({id: schema.name})).then(function onSuccess (response) {
			Q.resolve(true);
		}, function onError (error) {
			if(error.status == 409)
				return true;
			console.error(error);
			Q.reject(error);
		}));
	});
	return Q.all(regDeviceTypeReqs).then(function(res){
		return res;
	})
};

simulationClient.prototype.saveSimulationConfig = function(path){
	fs.writeJsonSync(path, this.simulationConfig);
};


simulationClient.prototype.startSimulation = function(){
	var _this = this;
	var body = {simulationConfig: this.simulationConfig};
	return callSimulationEngineAPI("POST", ["startSimulation"], body).then(function (resp){
		return _this.createws(resp.wsurl);
	})["catch"](function(err){
		console.error(err.message);
		throw new Error("Cannot start simulation " + err.message);
	});
};

simulationClient.prototype.terminateSimulation = function(deregisterDevices){
	var deferred = Q.defer();
	this.reconnectOnClose = false;
	callSimulationEngineAPI("DELETE", ["terminateSimulation", this.simulationConfig.sessionID]).then(function (resp){
		if(deregisterDevices){
			var schemaIndex = _.indexBy(this.simulationConfig.devicesSchemas, "guid");
			var body = [];
			_.each(this.simulationConfig.devices, function(device){
				body.push({typeId: schemaIndex[device.archDeviceGuid].name, deviceId: device.deviceID});
			});
			iotFClient.callApi('POST', 200, true, ['bulk', 'devices', 'remove'], JSON.stringify(body)).then(
					function onSuccess (response) {
						deferred.resolve();
					}, function onError (error) {
						console.error(error);
						deferred.reject(error);
					})
		}
		else
			deferred.resolve();
	})["catch"](function(err){
		deferred.reject(err);
	});
	return deferred.promise;
};

simulationClient.prototype.createDevices = function(deviceType, numOfDevices, configs){
	var deferred = Q.defer();

	var iotFClient = getIotfAppClient();

	var nameIndex = _.indexBy(this.simulationConfig.devicesSchemas, "name");
	var deviceSchema = nameIndex[deviceType];
	if(!deviceSchema)
		deferred.reject(new Error("no such device schema " + _.escape(deviceType)));

	configs = (configs) ? configs : [];
	var bulkRegRequest = [];
	for(var i = 0 ; i < numOfDevices; i++){
		var config = (configs[i]) ? configs[i] : {};
		var regReq = {
				deviceId: (config.deviceId) ? config.deviceId : generateMacAddress(),
				typeId: deviceType
		};
		bulkRegRequest.push(regReq);
	};
	var _this = this;
	iotFClient.callApi('POST', 201, true, ['bulk', 'devices', 'add'], JSON.stringify(bulkRegRequest)).then(
			function onSuccess (responses) {
				var result = [];
				_.each(responses, function(response, index){
					var config =  (configs[index]) ? configs[index] : {};
					var device = {
							"deviceID" : response.deviceId,
							"archDeviceGuid": deviceSchema.guid,
							"lastRunAttributesValues" : [],
							"connected": (config.connected == true),
							"iotFCredentials": {
								"org":iotFClient.org,
								"password": response.authToken
							}
					};

					if(config.attributesInitialValues)
						_.each(config.attributesInitialValues, function(value, name){
							device.lastRunAttributesValues.push({name: name, value: value});
						});
					this.addDevice(device);
					result.push(device);
				}, _this);
				deferred.resolve(result);
			}, function onError (error) {
				console.error(error);
				deferred.reject(error);

			});
	return deferred.promise;
};

simulationClient.prototype.getDevicesStaus= function(){
	var deferred = Q.defer();
	this.sendGetDeviceStatus();
	this.getCommandResponse('deviceStatus', deferred);
	return deferred.promise;
};

simulationClient.prototype.getDevicesSchema= function(){
	var deferred = Q.defer();
	this.sendGetDevicesStatus();
	this.getCommandResponse('devicesStatus', deferred);
	return deferred.promise;
};

simulationClient.prototype.getDeviceStaus= function(){
	var deferred = Q.defer();
	this.sendGetDevicesSchema();
	this.getCommandResponse('devicesSchema', deferred);
	return deferred.promise;
};

/*
 * ************************** Commands **************************
 * **************************************************************
 * connect / disconnect
 */
simulationClient.prototype.connectDevice = function(deviceID){
	var command = {cmdType: 'connect', deviceID: deviceID};
	this.sendCommand(command);
};

simulationClient.prototype.connectAllDevices = function(){
	var command = {cmdType: 'connectAll'};
	this.sendCommand(command);
};

simulationClient.prototype.disconnectDevice = function(deviceID){
	var command = {cmdType: 'disconnect', deviceID: deviceID};
	this.sendCommand(command);
};

simulationClient.prototype.disconnectAllDevices = function(){
	var command = {cmdType: 'disconnectAll'};
	this.sendCommand(command);
};

/*
 * Add delete devices
 */
simulationClient.prototype.addDevice = function(device){
	this.simulationConfig.devices.push(device);
	if(this.ws){
		var command = {cmdType: 'addDevice', simulationDevice: device};
		this.sendCommand(command);
	}
};

simulationClient.prototype.deleteDevice = function(deviceID){
	var devices;
	for(var i = 0; i < this.simulationConfig.devices.length; i++){
		if(this.simulationConfig.devices[i].deviceID == deviceID){
			this.simulationConfig.devices.splice(i, 1);
			this.saveSimulationConfig("./simulationConfig.json");
			break;
		}
	}
	if(this.ws){
		var command = {cmdType: 'deleteDevice', deviceID: deviceID};
		this.sendCommand(command);
	}
};

/*
 * Set attributes value
 */
simulationClient.prototype.setAttributeValue = function(deviceID, attributeName, attributeValue){
	var command = {cmdType: 'setAttribute', deviceID: deviceID, attributeName: attributeName, attributeValue: attributeValue};
	this.sendCommand(command);
};
/*
 * Devices status - connection status & attributes values
 */
simulationClient.prototype.sendGetAllDevicesStatus = function(){
	var command = {cmdType: 'allDevicesStatus'};
	this.sendCommand(command);
};

simulationClient.prototype.sendGetDeviceStatus = function(deviceID){
	var command = {cmdType: 'deviceStatus', deviceID: deviceID};
	this.sendCommand(command);
};

/*
 * Architecture devices commands
 */
simulationClient.prototype.addArchitectureDevice = function(archDevice){
	var command = {cmdType: 'addArchDevice', archDevice: archDevice};
	this.sendCommand(command);
};

simulationClient.prototype.updateArchitectureDevice = function(archDevice){
	var command = {cmdType: 'updateArchDevice', archDevice: archDevice};
	this.sendCommand(command);
};

simulationClient.prototype.sendGetDevicesSchema = function(){
	var command = {cmdType: 'getArchDevices'};
	this.sendCommand(command);
};

/*
 * ************************** EndCommands **************************
 * 
 * **************************** Events *****************************
 * *****************************************************************
 * simulation terminated
 */
simulationClient.prototype.onSimulationTerminated = function(){
	debug("Simulation event: onSimulationTerminated");
	this.emit("simulationTerminated");
};

/*
 * Connect \ Disconnect
 */

simulationClient.prototype.onDeviceConnected = function(deviceID){
	debug("Simulation event: onDeviceConnected deviceID: " + deviceID);
	this.emit("deviceConnected", deviceID);
};

simulationClient.prototype.onDeviceDisconnected = function(deviceID){
	debug("Simulation event: onDeviceDisconnected deviceID: " + deviceID);
	this.emit("deviceDisconnected", deviceID);
};

simulationClient.prototype.onDeviceConnectionError = function(deviceID, errMsg, errStack){
	debug("Simulation event: onDeviceConnectionError deviceID: " + deviceID + "errMsg: " + errMsg + " stacktrace: " + errStack);
	this.emit("deviceConnectionError", deviceID, errMsg, errStack);
	this.emit("error", {errType: "deviceConnectionError", deviceID: deviceID, message: errMsg, errStack: errStack});
};

/*
 * Device Status
 */

simulationClient.prototype.onNewDeviceCreated = function(device){
	debug("Simulation event: onNewDeviceCreated : " + JSON.stringify(device, null, 4));
	this.emit("newDevice", device);
};

simulationClient.prototype.onDeviceDeleted = function(deviceID){
	debug("Simulation event: onDeviceDeleted : " + deviceID);
	this.emit("deviceDeleted", deviceID);
};

simulationClient.prototype.onDeviceStatus = function(status){
	debug("Simulation event: onDeviceStatus : " + JSON.stringify(status, null, 4));
	this.emit("deviceStatus", status);
};

simulationClient.prototype.onAllDevicesStatus = function(status){
	debug("Simulation event: onAllDevicesStatus : " + JSON.stringify(status, null, 4));
	this.emit("devicesStatus", status);
};

/*
 * Attributes change
 */
simulationClient.prototype.onAttributeValueChange = function(deviceID, attrNames2Values){
	debug("Simulation event: onAttributeValueChange deviceID : " + deviceID + " attrNames2Values: " +JSON.stringify(attrNames2Values, null, 4));
	this.emit("attributeValueChange", deviceID, attrNames2Values);
};

/*
 * Architecture devices events
 */
simulationClient.prototype.onDevicesSchema = function(schemas){
	debug("Simulation event:  onArchitectureDevices: " + JSON.stringify(archDevices, null, 4));
	this.emit("devicesSchema", schemas);
};

simulationClient.prototype.onDevicesSchemaUpdated = function(schema){
	debug("Simulation event:  onArchitectureDeviceUpdated: " + JSON.stringify(archDevice, null, 4));
	this.emit("deviceSchemaUpdated", schema);
};

simulationClient.prototype.onNewDeviceSchema = function(schema){
	debug("Simulation event:  onNewArchitectureDevice: " + JSON.stringify(archDevice, null, 4));
	this.emit("newDeviceSchema", schema);
};

/*
 * user code errors
 */
simulationClient.prototype.onUserCodeError = function(deviceID, hookName, errMsg, errStack){
	debug("Simulation event: onUserCodeError deviceID: " + deviceID + " hookname:" + hookName + " errMsg: " + errMsg + " stacktrace: " + errStack);
	this.emit("userCodeError",deviceID, hookName, errMsg, errStack);
	this.emit("error", {errType: "userCodeError", deviceID: deviceID, message: errMsg, errStack: errStack, behaviourType: hookName});
};

simulationClient.prototype.onUserCodeRuntimeError = function(deviceID, hookName, errMsg, errStack){
	debug("Simulation event: onUserCodeRuntimeError deviceID: " + deviceID + " hookname:" + hookName + " errMsg: " + errMsg + " stacktrace: " + errStack);
	this.emit("userCodeRuntimeError",deviceID, hookName, errMsg, errStack);
	this.emit("error", {errType: "userCodeRuntimeError", deviceID: deviceID, message: errMsg, errStack: errStack, behaviourType: hookName});

};
/*
 * ********************* End Events **********************
 */


//internals

simulationClient.prototype.getCommandResponse= function(eventName, deferred){
	var _this = this;
	var responselistener = function(){
		_this.removeListener(eventName, responselistener);
		_this.removeListener('error', errorlistener);
		_this.removeListener('connectionClose', errorlistener);
		_this.removeListener('simulationTerminated', errorlistener);
		deferred.resolve.apply(arguments);
	};

	var errorlistener = function(){
		_this.removeListener('error', errorlistener);
		_this.removeListener('connectionClose', errorlistener);
		_this.removeListener('simulationTerminated', errorlistener);
		_this.removeListener(eventName, responselistener);
		deferred.reject.apply(arguments);
	};

	this.on(eventName, responselistener);
	this.on('error', errorlistener);
	this.on('connectionClose', errorlistener);
	this.on('simulationTerminated', errorlistener);
};

simulationClient.prototype.createws = function(wsurl){
	var deferred = Q.defer();

	if(this.ws){
		this.ws.terminate();
		delete this.ws;
	}
	this.reconnectOnClose = true;
	debug("createws "  + wsurl);
	this.ws = new WebSocket(wsurl);

	this.ws.on('open', _.bind(function (){
		if(deferred){
			deferred.resolve('connectted');
			deferred = null;
		}
		console.log("simulationClient: *** connection open ***");
		this.emit("connectionOpen");
	}, this));
	this.ws.on('close', _.bind(function(code, message) {
		this.emit("connectionClose", code, message);
		console.log("simulationClient: *** connection closed ***");
		if(this.reconnectOnClose)
			this.createws(wsurl);
	}, this));
	this.ws.on('error', _.bind(function(error) {
		this.emit("connectionError", error.code, error.message);
		this.emit("error", {errType: "connectionError", code: error.code, message: error.message});
		if(deferred){
			deferred.reject(error);
			deferred = null;
		}
	}, this));
	this.ws.on('message', _.bind(this.onMessage, this));
	return deferred.promise;
};


simulationClient.prototype.sendCommand = function(cmd){
	if(!this.ws)
		throw new Error("Not connected - cannot send command");
	this.ws.send(JSON.stringify(cmd));
};

simulationClient.prototype.onMessage = function(msg){
	message = JSON.parse(msg);
	if(message.error){
		this.emit("simulationError", message.error);
		message.error.errType = "simulationError";
		this.emit("error", message.error);
		console.error("Simulation message error: " + message.error);
		return;
	}

	switch (message.messageType) {
	case "simulationTerminated":
		this.onSimulationTerminated();
		break;
	case "deviceStatus":
		delete message.messageType;
		this.onDeviceStatus(message);
		break;
	case "devicesStatus":
		delete message.messageType;
		this.onAllDevicesStatus(message);
		break;
	case "deviceConnected":
		this.onDeviceConnected(message.deviceID);
		break;
	case "newDeviceCreated":
		this.onNewDeviceCreated(message.device);
	case "deviceDeleted":
		this.onDeviceDeleted(message.deviceID);
		break;
	case "deviceAttributesChange":
		this.onAttributeValueChange(message.deviceID, message.changedAttributes);
		break;
	case "deviceConnected":
		this.onDeviceConnected(message.deviceID);
		break;
	case "deviceDisconnected":
		this.onDeviceDisconnected(message.deviceID);
		break;
	case "architectureDevices":
		this.onDevicesSchema(message.archDevices);
		break;
	case "architectureDeviceUpdated":
		this.onDevicesSchemaUpdated(message.archDevice);
		break;
	case "newArchitectureDevice":
		this.onNewDeviceSchema(message.archDevice);
		break;
	case "deviceConnectionError":
		this.onDeviceConnectionError(message.deviceID, message.message ,message.stack);
		break;
	case "deviceBehaviorCodeError":
		this.onUserCodeError(message.deviceID, message.hookName, message.message ,message.stack);
		break;
	case "deviceBehaviorRuntimeError":
		this.onUserCodeRuntimeError(message.deviceID, message.hookName, message.message ,message.stack);
		break;
	default:
		break;
	};
};

function callSimulationEngineAPI(method, paths, body){
	var simulationCreds;
	var userVcapSvc = JSON.parse(process.env.USER_PROVIDED_VCAP_SERVICES || '{}');
	var vcapSvc = userVcapSvc.devicesSimulation;
	if (vcapSvc) {
		simulationCreds = vcapSvc[0];
		if(!simulationCreds.uri){
			// use simulation engine in this application. 
			simulationCreds.uri = appEnv.url + "/api";
		}
		console.log("!!! connecting to simulation engine using credentials from USER_PROVIDED_VCAP_SERVICES !!! : " + simulationCreds.uri);
	} else {
		// use simulation engine in this application. 
		// apiKey and apiToken should be same as values defined in deviceSimulationEngine/api.js
		simulationCreds = {
			uri: appEnv.url + "/api",
			apiKey: "PUT_YOUR_OWN_API_KEY",
			apiToken: "PUT_YOUR_OWN_API_TOKEN"
		};
	}
	
	var uri = simulationCreds.uri;
	if(paths){
		for(i in paths){
			uri += '/'+paths[i];
		}
	}
	return callRestApi(uri, simulationCreds.apiKey, simulationCreds.apiToken, method, JSON.stringify(body));
};

function callRestApi(uri, apiKey, apiToken, method, body, expectedHttpCode, expectJsonContent){
	expectedHttpCode = (expectedHttpCode) ? expectedHttpCode : 200;
	expectJsonContent = (expectJsonContent) ? expectJsonContent : true;
	if(!_.isArray(expectedHttpCode))
		expectedHttpCode = [expectedHttpCode];

	var deferred = Q.defer();

	request(
			uri,
			{
				method: method,
				rejectUnauthorized: true,
				body: body,
				auth: {
					user: apiKey,
					pass: apiToken,
					sendImmediately: true
				},
				headers: {'Content-Type': 'application/json', "Content-Length": Buffer.byteLength(body)}
			},
			function (error, response, body) {
				if(error){
					deferred.reject(error);
				}else{
					if(expectedHttpCode.indexOf(response.statusCode) != -1){
						if(expectJsonContent){
							try{
								deferred.resolve(JSON.parse(body));
							} catch (ex){
								deferred.reject(ex);
							}
						}else{
							deferred.resolve(body);
						}
					}else{
						deferred.reject(new Error(method+" "+uri+": Expected HTTP "+expectedHttpCode+" from server but got HTTP "+response.statusCode));
					}
				}
			}
	);
	return deferred.promise;
};



var iotfAppClient = null;
function getIotfAppClient(){
	if(iotfAppClient)
		return iotfAppClient;
	var iotfAppClientCtor = require("ibmiotf").IotfApplication;
	var iotFcreds = null;
	try{
		iotFcreds = VCAP_SERVICES["iotf-service"][0].credentials;

	}catch (e) {
		throw new Error("Cannot get IoT-Foundation credentials");
	};
	var config = {
			"org" : iotFcreds.apiKey.split("-")[1],
			"id" : "hi",
			"auth-key" : iotFcreds.apiKey,
			"auth-token" : iotFcreds.apiToken
	};
	iotfAppClient = new iotfAppClientCtor(config);
	return iotfAppClient;
};

function generateMacAddress(){
	var mac = Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16) +
	Math.floor(Math.random() * 16).toString(16);
	var macStr = mac[0].toUpperCase() + mac[1].toUpperCase() + mac[2].toUpperCase() + mac[3].toUpperCase() +
	mac[4].toUpperCase() + mac[5].toUpperCase() + mac[6].toUpperCase() + mac[7].toUpperCase() +
	mac[8].toUpperCase() + mac[9].toUpperCase() + mac[10].toUpperCase() + mac[11].toUpperCase();
	return macStr;
};


//get service credentials
/*
var userProviedServices = [0].credentials;
var simulationCreds = null;
if(VCAP_SERVICES["user-provided"]){
	for (var i = 0; i < VCAP_SERVICES["user-provided"].length; i++) {
		if(VCAP_SERVICES["user-provided"][i].name == 'DevicesSimulation'){
			simulationCreds = VCAP_SERVICES["user-provided"][i].credentials;
			break;
		}
	}
}
if(!simulationCreds)
	throw new Error("cannot get  Devices-Simulation service credentials");*/