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
 * Simulation Engine - Virtual Device
 * - a simulated divice managed by devicesManager
 */
module.exports = virtualDevice;
var _ = require("underscore");
var ibmiotf = require("ibmiotf");
const nodeUtils = require('util');
const EventEmitter = require('events');


function virtualDevice(deviceModel, deviceInstance, connect){
	// Initialize necessary properties from `EventEmitter` in this instance
	EventEmitter.call(this);
	
	this.resetDeviceArch(deviceModel);

	//device instance id
	this.deviceID = deviceInstance.deviceID;
	//device instance iotF credentials
	var iotFOrg = (deviceInstance.iotFCredentials.org) ? deviceInstance.iotFCredentials.org : deviceInstance.iotFCredentials.uuid.split(":")[1];
	this.creds = {
			"org" : iotFOrg,
			"id" : this.deviceID,
			"type" : this.deviceType,
			"auth-method" : "token",
			"auth-token" : deviceInstance.iotFCredentials.password
	};
	//set last attributes values from last run
	_.each(deviceInstance.lastRunAttributesValues, function(runVal){
		if(!_.isUndefined(runVal.value))
			this[runVal.name] = runVal.value;
	},this);

	//create iotf device client
	this.deviceClient =  new ibmiotf.IotfDevice(this.creds);
	//setup iotf client callbacks
	this.deviceClient.on("connect", _.bind(this.onConnected, this));
	this.deviceClient.on("disconnect", _.bind(this.onDisconnect, this));
	this.deviceClient.on("command", _.bind(this.onCommand, this));
	this.deviceClient.on("error", _.bind(this.onError, this));

	Object.observe(this, _.bind(this.onPropertyChange, this))
	//done init - run on init behavior code
	this.onInit();
	
	//start Periodic actions
	this.startPeriodicAction();

	//if was connected then connect
	if(deviceInstance.connected || connect)
		this.connect();
};

//Inherit functions from `EventEmitter`'s prototype
nodeUtils.inherits(virtualDevice, EventEmitter);

virtualDevice.prototype.resetDeviceArch = function(deviceModel){
	//rest old arch
	//delete attributes
	if(this.deviceAttributes){
		_.each(this.deviceAttributes, function(attrName){
			delete this[attrName];
		}, this);
	}
	//delete old send functions
	if(this.mqttOutputs){
		_.each(this.mqttOutputs, function(mqttOutput){
			delete this['send' + mqttOutput.name + 'Message'];
		}, this);
	}
	//remove cached user code
	//? needs to be done ? delete virtualDevice.prototype.behaviorCodeCache[deviceModel.guid];
	
	//device type
	this.deviceType = deviceModel.name;
	this.archDeviceGuid = deviceModel.guid;
	//keep the device model attributes
	this.deviceAttributes = _.indexBy(deviceModel.attributes, "name");
	//create same attributes on this device and init with default value
	_.each(deviceModel.attributes, function(attribute){
		var defaultValue;
		if(attribute.dataType == 'Number') {
			defaultValue = 0;
		} else if(attribute.dataType == 'Boolean') {
			defaultValue = false;
		} else {
			defaultValue = "";
		}
		if(attribute.defaultValue && attribute.defaultValue.trim() != '')
			defaultValue = attribute.defaultValue.trim();
		
		this[attribute.name] = defaultValue;
		
	}, this);


	//device inputs
	this.mqttInputs = {};
	_.each(deviceModel.mqttInputs,
			function(mqttInput){
		var deviceInput = {
				name: mqttInput.name,
				patternType : mqttInput.pattern.type,
				patternRate : mqttInput.pattern.rate,
				qos : mqttInput.qos,
				payload : (mqttInput.payload) ? mqttInput.payload.split(',') : []
		};
		this.mqttInputs[mqttInput.name] = deviceInput;
	}, this);

	//device outputs
	this.mqttOutputs = {};
	//map of attributes to messages the are sent on attribute change
	this.onChangeAttr2MsgMap = {};
	_.each(deviceModel.mqttOutputs,
			function(mqttOutput){
		var deviceOutput = {
				name: mqttOutput.name,
				patternType : mqttOutput.pattern.type,
				patternRate : mqttOutput.pattern.rate,
				qos : mqttOutput.qos,
				payload : (mqttOutput.payload) ? mqttOutput.payload.split(',') : []
		};


		//create send<message name>Message function
		this['send' + mqttOutput.name + 'Message'] = _.wrap(_.bind(this.sendMessage, this), function(func) {
			return func(mqttOutput.name);
		});

		//cache attributes that trigger a message on change
		if(deviceOutput.patternType == "OnChange"){
			_.each(deviceOutput.payload, function(attName){
				this.onChangeAttr2MsgMap[attName] = (this.onChangeAttr2MsgMap[attName]) ? this.onChangeAttr2MsgMap[attName] : [];
				this.onChangeAttr2MsgMap[attName].push(deviceOutput.name);
			},this)
		}
		this.mqttOutputs[mqttOutput.name] = deviceOutput;
	}, this);
	

	//device behavior code
	_.extend(this, deviceModel.simulation);

};

virtualDevice.prototype.isConnected = function(){
	return this.deviceClient.isConnected;
};

virtualDevice.prototype.destroy = function(){
	this.stopPeriodicAction();
	this.stopPeriodicMessages();
	this.disconnect();
	this.removeAllListeners("attributesChange");
	this.removeAllListeners("connected");
	this.removeAllListeners("disconnected");
	this.removeAllListeners("connectionError");
	this.removeAllListeners("behaviorRuntimeError");
	this.removeAllListeners("behaviorCodeError");
};

virtualDevice.prototype.onPropertyChange = function(changes){
	//collect device attributes modifications
	var changedAttributesValueMap = {};
	//collect messages that are triggered from this change
	var messages2Send = [];

	_.each(changes, function(change){
		if(this.onChangeAttr2MsgMap[change.name])//if the change is in attribute that triggeres an on change message
			messages2Send = messages2Send.concat(messages2Send, this.onChangeAttr2MsgMap[change.name]);//add messages to send

		if(this.deviceAttributes[change.name] && changedAttributesValueMap[change.name] == undefined)
			changedAttributesValueMap[change.name] = this[change.name];
	}, this);


	messages2Send = _.uniq(messages2Send);	//remove duplicates
	_.each(messages2Send, function(msgName){
		this.sendMessage(msgName);		//send message
	}, this);


	if(!_.isEmpty(changedAttributesValueMap))
		this.emit("attributesChange", this, changedAttributesValueMap);
}

virtualDevice.prototype.onInit = function(){
	if(this.onInitCode)
		this.runBehaviorCode(this.onInitCode, "onInit");
};

virtualDevice.prototype.sendMessage = function(msgName){
	if(!this.isConnected()){
		console.error("disconnected: cannot send message");
		return;
	}
	var outputMsg = this.mqttOutputs[msgName];
	if(!outputMsg){
		console.error("Unknown message: " + msgName);
		return;
	}
	var payload = {};
	_.each(outputMsg.payload, function(attrName){
		if(!this[attrName] == undefined)
			console.error("no such attribute " + attrName + " used as payload in message " + msgName);
		else
			payload[attrName] = this[attrName];

	},this)

	payload = JSON.stringify(payload);
	this.deviceClient.publish(outputMsg.name, "json",'{"d" : ' + payload + '}', parseInt(outputMsg.qos));


};

virtualDevice.prototype.startPeriodicAction = function(){
	if(this.periodActionIntervalId)
		return;//already running
	if(this.onRunningCode){
		var _this = this;
		this.onRunningPeriodSec = (this.onRunningPeriodSec) ? this.onRunningPeriodSec : 1;
		this.periodActionIntervalId = setInterval(function() {
			_this.runBehaviorCode(_this.onRunningCode, "While Running");
		}, this.onRunningPeriodSec * 1000);
	}
};

virtualDevice.prototype.stopPeriodicAction = function(){
	if(this.periodActionIntervalId){
		clearInterval(this.periodActionIntervalId);
		this.periodActionIntervalId = null;
	}
};

virtualDevice.prototype.startPeriodicMessages = function(){
	if(this.periodicMessagesIntervals)
		return;//already running
	this.periodicMessagesIntervals = [];
	var _this = this;
	_.each(this.mqttOutputs, function(outPutMsg){
		if(outPutMsg.patternType == 'Periodic'){
			var rate = (outPutMsg.patternRate) ? outPutMsg.patternRate : 1;
			var intervalID = setInterval(function(){
				_this.sendMessage(outPutMsg.name);
			}, rate * 1000);
			this.periodicMessagesIntervals.push(intervalID);
		}
	}, this);
};

virtualDevice.prototype.stopPeriodicMessages = function(){
	_.each(this.periodicMessagesIntervals, function(intervalID){
		clearInterval(intervalID);
	});
	this.periodicMessagesIntervals = null;
};

virtualDevice.prototype.connect = function(){
	try {
		this.deviceClient.connect();
	} catch (e) {
		this.dumpError("error on connect", e);
	}
};

virtualDevice.prototype.disconnect = function(){
	try {
		this.deviceClient.disconnect();
	} catch (e) {
		if(e.message == "Client is not connected")
			console.log("already disconnected");
		else
			this.dumpError("error on disconnect", e);
	}
};

virtualDevice.prototype.onConnected = function(){
	this.emit("connected", this);
	if(this.onConnectedCode)
		this.runBehaviorCode(this.onConnectedCode, "onConnected");
	this.startPeriodicMessages();
};

virtualDevice.prototype.onDisconnect = function(){
	this.emit("disconnected", this);
	this.stopPeriodicMessages();
};

virtualDevice.prototype.onCommand = function(commandName,format,payload,topic){
	if(this.onMessageReceptionCode)
		this.runBehaviorCode(this.onMessageReceptionCode, "onMessageReception", {message: commandName, payload: payload, topic: topic});
};

virtualDevice.prototype.onError = function(err){
	if(err.message && err.message.indexOf('ot authorized') >= 0){
		// stop reconnecting on auth failure
		if (this.deviceClient && this.deviceClient.mqtt){
			this.deviceClient.mqtt.end(false, function(){});
			this.deviceClient.mqtt = null;
		}
	}
	this.emit("connectionError", this, err);
	this.dumpError("error in iotF client ", err);
};

virtualDevice.prototype.runBehaviorCode = function(code, hookName, args){
	if(code instanceof Function){
		code.call(this, args);
		return;
	}
	var argsNames = "";
	var argsValues = [];
	if(args){
		argsNames = _.keys(args).toString();
		argsValues = _.values(args);
	}
	var behaviorFunc = this.getBehaviorCodeFunction(argsNames, code, (hookName) ? hookName : "");
	if(behaviorFunc){
		try{
			behaviorFunc.apply(this, argsValues);
		}
		catch(e){
			this.emit("behaviorRuntimeError", this, e, hookName);
			this.dumpError("error while running  behavior code at " + hookName , e);
		}
	}
};

virtualDevice.prototype.behaviorCodeCache = {};

virtualDevice.prototype.getBehaviorCodeFunction = function(argsNames, code, hookName){
	var cache = virtualDevice.prototype.behaviorCodeCache[this.archDeviceGuid];
	if(cache && cache[argsNames + code + hookName]){
		if(cache[argsNames + code + hookName] == "INVALID")
			return null;
		else
			return cache[argsNames + code + hookName]; //use cached function
	}
	
	//create new function
	try{
		var functionLiteral = "function("+ argsNames +"){" + code  + "}";
		//console.log("Evaluating a function literal: " + functionLiteral);
		var wrappingFunction = getWrappingFunction(functionLiteral, console, _);
		
		//cache the function
		cache = (cache) ? cache : {};
		cache[argsNames + code + hookName] = wrappingFunction;
		virtualDevice.prototype.behaviorCodeCache[this.archDeviceGuid] = cache;
		
		return wrappingFunction;
	}
	catch(e){
		cache = (cache) ? cache : {};
		cache[argsNames + code + hookName] = "INVALID";
		this.emit("behaviorCodeError", this, e, hookName);
		this.dumpError("error evaluating behavior code at " + hookName + " code: " + code , e);
		virtualDevice.prototype.behaviorCodeCache[this.archDeviceGuid] = cache;
		return null;
	}
}

function getWrappingFunction(/*function_literal_to_eval, console, _*/){
	/*
	 * This function is to get a new function object which is created under new scope:
	 * var _eval = require('eval');
	 * var scope = {console: console, _ : _};
	 * return _eval('module.exports = ' + <function literal as arg1>, scope, true);
	 */
	var console = arguments[1];
	var _ = arguments[2];
	return eval("(0," + arguments[0] + ")");
}

virtualDevice.prototype.dumpError = function(msg, err){
	msg = (msg) ? msg : "";
	msg = "in device " + this.deviceType + " id:" + this.deviceID + " message: " + msg;
	dumpError(msg,err);
};

