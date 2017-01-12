/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var _ = require("underscore");
var fs = require('fs-extra');
var Q = new require('q');
var debug = require('debug')('devices');
debug.log = console.log.bind(console);

var appEnv = require("cfenv").getAppEnv();
var IOTF = require('../watsonIoT');
var dbClient = require('../cloudantHelper.js');
var connectedDevices = require('../workbenchLib').connectedDevicesCache;

/*
 * get device credentials for IoT Platform
 */
var device_credentials = dbClient.getDB("device_credentials");

//get CD client
var DB = null;
dbClient.getDBClient().then(function(db){
	DB = db;
});

var devices = {
	devicesConfig: function() {
		deviceTypeSchema = fs.readJsonSync('devices/deviceType.json');
		return {deviceTypeSchema: deviceTypeSchema};
	}(),

	// get all devices registered in IoT Platform
	_getAllIoTDevices: function(iotfDevices, bookmark, deferred) {
		if (!iotfDevices)
			iotfDevices = [];
		if (!deferred)
			deferred = Q.defer();
		var params = {};
		if (bookmark) params._bookmark = bookmark;
		
		IOTF.iotfAppClient.callApi('GET', 200, true, ['bulk', 'devices'], null, params).then(function(response) {
			var resultDevices = response.results || [];
			iotfDevices = iotfDevices.concat(resultDevices.map(function(d) {
				return {deviceId: d.deviceId, typeId: d.typeId, registrationDate: new Date(d.registration.date).getTime(), deviceInfo: d.deviceInfo, metadata: d.metadata};
			}));
			if (response.bookmark) {
				devices._getAllIoTDevices(iotfDevices, response.bookmark, deferred);
			} else {
				deferred.resolve(iotfDevices);
			}
		}, function(err) {
			deferred.reject(err);
		});
		return deferred.promise;
	},
	
	/**
	 * Get all devices
	 */
	getAllDevices: function() {
		var iotfDevices = [];
		var deviceDetailsList = [];
		var connectedDeviceList = [];
		
		// get all devices registered in IoT Platform
		function getIotfDevices() {
			return devices._getAllIoTDevices().then(function(results) {
				iotfDevices = results;
			});
		};

		// get all device details stored in cloudant DB
		function getDBDeviceDetails() {
			return devices.getDeviceDetails().then(function(result) {
				deviceDetailsList = result || [];
				return deviceDetailsList;
			});
		};
		
		function getConnectedDevices() {
			connectedDeviceList = connectedDevices.getConnectedDevices();
			return Q(connectedDeviceList);
		};
		
		// merge results
		return Q.all([getIotfDevices(), getDBDeviceDetails(), getConnectedDevices()]).then(function() {
			var deviceMap = {};
			var cacheValue = function(typeId, deviceId, key, value, createIfNotExist) {
				if (!deviceMap[typeId]) deviceMap[typeId] = {};
				var map = deviceMap[typeId];

				if (!key) {
					map[deviceId] = value;
					return true;
				} else if (createIfNotExist || map[deviceId]) {
					var d = map[deviceId] ? map[deviceId] : {deviceId: deviceId};
					d[key] = value;
					map[deviceId] = d;
					return true;
				}
				return false;
			};
			
			// append iot platform devices
			_.each(iotfDevices, function(device) {
				cacheValue(device.typeId, device.deviceId, null, device);
			});
			
			// append device details
			_.each(deviceDetailsList, function(deviceDetails) {
				var found = false;
				_.each(deviceMap, function(map, typeId) {
					if (cacheValue(typeId, deviceDetails.deviceID, "deviceDetails", deviceDetails, false)) {
						found = true;
					}
				});
				if (!found)
					cacheValue(devices.devicesConfig.deviceTypeSchema.id, deviceDetails.deviceID, "deviceDetails", deviceDetails, true);
			});
			
			// append connected devices
			_.each(connectedDeviceList, function(connectedDevice) {
				cacheValue(connectedDevice.deviceType, connectedDevice.deviceID, "connected", connectedDevice);
			});

			// flatten devices
			var results = [];
			_.each(deviceMap, function(map, typeId) {
				_.each(map, function(v, deviceId) {
					results.push(v);
				});
			});
			return results.sort(function(a, b) { 
				return b.registrationDate - a.registrationDate;
			});
		}, function(error) {
			console.error(error);
			return Q.reject(error);
		});
	},

	/**
	 * Get device details for specific device stored in cloudant DB
	 */
	getDeviceDetails: function(device) {
		var dataTypeSchema = devices.getDeviceTypeSchema(device && device.typeID);
		var deviceId = (device && device.deviceID) || null;
		var deviceTypeId = dataTypeSchema.id;
		
		console.log("getting device details...: " + (deviceId ? deviceId : "all"));
		return dbClient.getExistingDeviceDetails(device).then(function onSuccess (deviceDetails) {
			console.log("device details are retrieved successfully");
			return deviceDetails;
		}, function(error) {
			console.error(error);
			return Q.reject(error);
		});
	},
	
	/**
	 * Create new device
	 * 1. Register a device to IoT Platform
	 * 2. Create a document for the device
	 */
	createDevice: function(device, deviceDetails) {
		device = devices.validate(device, true) || {};
		deviceDetails = devices.validate(deviceDetails);
		
		if (!device.deviceID) device.deviceID = devices.generateMacAddress();
		if (!device.typeID) device.typeID = devices.getDeviceTypeSchema().id;

		if (!deviceDetails && device.assignExistingDetails) {
			deviceDetails = dbClient.onGettingNewDeviceDetails(device);
		}
		if (!deviceDetails) {
			console.log("deviceDetails is not found. Empty object is created. ")
			deviceDetails = {};
		}
		deviceDetails.deviceType = device.typeID;
		
		console.log("creating device...: " + device.deviceID);
		return devices.createCredentials(device).then(function(credentials) {
			return dbClient.createDevice(device, deviceDetails).then(function() {
				console.log("device is created successfully");
				return device;
			});
		});
	},
	
	/**
	 * Update device details for specific device in cloudant DB
	 */
	updateDevice: function(device, deviceDetails) {
		deviceDetails = devices.validate(deviceDetails);
		console.log("updating device...: " + device.deviceID);
		return dbClient.updateDeviceDetails(device, deviceDetails).then(function() {
			console.log("device is updated successfully");
		});
	},

	/**
	 * Delete specific device from both IoT Platform and cloudant
	 */
	removeDevice: function(device, updateCache) {
		if (Array.isArray(device)){
			return Q.all(device.map(function(d) {return devices.removeDevice(d, false);})).then(function() {
				if (updateCache)
					devices.devicesCache.saveDevices();
				return true;
			});
		}

		var deferred = Q.defer();
		var removeCache = function() {
			if (devices.devicesCache && devices.devicesCache.deleteDevice) {
				return devices.devicesCache.deleteDevice(device, true).then(function() {
					if (updateCache)
						devices.devicesCache.saveDevices();
					return Q(true);
				}, function(error) {
					return Q.reject({status: 500, message: error});
				});
			} else {
				return Q(true);
			}
		};

		console.log("removing device...: " + device.deviceID);
		Q.when(removeCache()).then(function() {
			// Remove cache
			connectedDevices.deleteDevice(device.typeID, device.deviceID);
			
			// Remove device details
			return dbClient.removeDeviceDetails(device).then(function onSuccess () {
				console.log("device is removed successfully");
				return true;
			}, function onError (error) {
				if (error.statusCode == 404) {
					return true;
				}
				console.error(error);
				deferred.reject(error);
				return false;
			}).then(function(cont) {
				if (!cont) {
					return;
				}
				return devices.removeCredentials(device).then(function onSuccess () {
					deferred.resolve(device);
				}, function onError (error) {
					if (error.status == 404) {
						return deferred.resolve(device);
					}
					deferred.reject(error);
				});
			});
		}, function(error) {
			console.error(error);
			deferred.reject(error);
		}).done();
		return deferred.promise;
	},

	getCredentials: function(device, createIfNotExists) {
		var deferred = Q.defer();
		var deviceId = device.deviceID;

		console.log("getting credentials : " + deviceId);
		var dataTypeSchema = devices.getDeviceTypeSchema(device.typeID);
		Q.when(device_credentials, function(db){
			db.get(deviceId, function(err, body) {
				var iotfAppClient = IOTF.iotfAppClient;
				var deviceTypeId = dataTypeSchema.id;
				if (!err) {
					console.log("Found doc: ", body, body.token);
					var credentials = { 
						deviceType: deviceTypeId, 
						deviceId: deviceId, 
						token: body.token, 
						org: iotfAppClient.org
					};
					return dbClient.getExistingDeviceDetails(device).then(function(data) {
						// use existing car details if they exist
						credentials.deviceDetails = data;
						return credentials;
					}, function(err) {
						if (err.statusCode === 404) {
							return Q(true);
						}
						console.error(err);
						deferred.reject(err);
					}).then(function(data) {
						deferred.resolve(credentials);
					});
				} else if (err.statusCode == 404 && createIfNotExists) {
					console.log("creadentials are not found. creating it...");
					return devices.createCredentials(device).then(function(credentials) {
						console.log("credentials are created: ", credentials, credentials.token);
						
						return dbClient.getExistingDeviceDetails(device).then(function(data) {
							// use existing car details if they exist
							credentials.deviceDetails = data;
							return credentials;
						}, function(err) {
							if (err.statusCode === 404) {
								// Set default car details for device on mobile app
								var userOwnedDeviceDetails = {
									name: "User owened car",	
									license: "123-45-6789",	
								};
								if (device.ownerID)
									userOwnedDeviceDetails.ownerId = device.ownerID;
								userOwnedDeviceDetails.model = {
									    makeModel: "User's device",
									    year: 2016,
									    mileage: 0,
									    stars: 5,
									    hourlyRate: 0,
									    dailyRate: 0,
									    thumbnailURL: appEnv.url + "/images/car_icon.png"
								};
								return dbClient.createDevice(device, userOwnedDeviceDetails).then(function() {
									console.log("device is created successfully");
									credentials.deviceDetails = userOwnedDeviceDetails;
									return credentials;
								});
							} else {
								return Q.reject(err);
							}
						}).then(function(data) {
							deferred.resolve(credentials);
						}, function(err) {
							console.error(err);
							deferred.reject(err);
						});
					}, function(err) {
						console.error(err);
						deferred.reject(err);
					});
				} else {
					console.error(err);
					deferred.reject(err);
				}
			});
		}).done();
		return deferred.promise;
	},

	createCredentials: function(device) {
		var deferred = Q.defer();

		var iotfAppClient = IOTF.iotfAppClient;
		var dataTypeSchema = devices.getDeviceTypeSchema(device.typeID);
		var deviceId = device.deviceID;
		var deviceTypeId = dataTypeSchema.id;
		
		Q.when(device_credentials, function(db){

			var registerDevice = function() {
				return devices._getAllIoTDevices().then(function(iotDevices) {
					
					// Check all device types and return an error if deviceId already exists. 
					if (iotDevices && iotDevices.some(function(d) {return d.deviceId === deviceId;})) {
						var error = {status: 409, message: "$s is already registered.".replace("$s", _.escape(deviceId))};
						return Q.reject(error);
					}

					console.log("registering device id: " + deviceId);
					var deviceIdReqPath = ['device', 'types', deviceTypeId, 'devices'];
					var deviceIdReqBody = JSON.stringify({deviceId:deviceId});
					return iotfAppClient.callApi('POST', 201, true, deviceIdReqPath, deviceIdReqBody).then(function onSuccess (creds) {
						console.log("The device id is registered successfully");
						var creds = { 
								deviceType: creds.typeId, 
								deviceId: creds.deviceId, 
								token: creds.authToken, 
								org: iotfAppClient.org
							};
						db.insert({token: creds.token }, creds.deviceId, function(err, body) {});	
						return creds;
					}, function(err) {
						console.log(err);
						if (err.status === 403) {
							return Q.reject({
								status: 500, 
								message: 'Failed to create a device: ' + (err.message || (err.data && err.data.message) || 'see console log for the details')
							});
						}
						return Q.reject(err);
					});
				});
			};

			// first, try to register device type
			console.log("Registering a device type: " + deviceTypeId);
			iotfAppClient.callApi('GET', 200, true, ['device', 'types'], null, {id: deviceTypeId}).then(function onSuccess (response) {
				if (response.results && response.results.length > 0) {
					return registerDevice();
				} else {
					return iotfAppClient.callApi('POST', 201, true, ['device', 'types'], JSON.stringify(dataTypeSchema)).then(function onSuccess (response) {
						console.log("The device type is registered successfully.");
						return registerDevice();
					}, function onError (error) {
						if(error.status == 409){
							return registerDevice();
						} else {
							return Q.reject(error);
						}
					});
				}
			}).then(function(data) {
				deferred.resolve(data);
			}, function(error) {
				console.error(error);
				deferred.reject(error);
			});
		});
		return deferred.promise;
	},
	
	removeCredentials: function(device) {
		var deferred = Q.defer();
		// check to see if this device exists in the DB

		var iotfAppClient = IOTF.iotfAppClient;
		var dataTypeSchema = devices.getDeviceTypeSchema(device.typeID);
		var deviceId = device.deviceID;
		var deviceTypeId = dataTypeSchema.id;
		
		console.log("removing a device id: " + deviceId);
		iotfAppClient.callApi('DELETE', 204, false, ['device', 'types', deviceTypeId, 'devices', deviceId]).then(function onSuccess (response) {
			console.log("The device id is removed.");
			return true;
		}, function onError (error) {
			if(error.status == 404){
				return true;
			}
			return Q.reject(error);
		}).then(function(){
			Q.when(device_credentials, function(db){
				console.log("removing a device credentials: " + deviceId);
				db.get(deviceId, function(err, body) {
					if (!err) {
						console.log("The device credential is removed.");
						db.destroy(body._id, body._rev, function(err, data) {
							if (!err) {
								deferred.resolve(data);
							} else {
								console.error(err);
								deferred.reject(err);
							}
						});
					} else if (err.statusCode == 404) {
						deferred.resolve();
					} else {
						console.error(error);
						deferred.reject(error);
					}
				});
			});
		}, function(error) {
			console.error(error);
			deferred.reject(error);
		});
		return deferred.promise;
	},

	getDeviceTypeSchema: function(typeId) {
		if (!typeId || typeId === devices.devicesConfig.deviceTypeSchema.id)
			return devices.devicesConfig.deviceTypeSchema;
		return {
			  id: typeId,
			  description: "User specified vehicle device",
			  classId: "Device",
			  deviceInfo: {},
			  metadata: {}
			}
	},
	
	validate: function(value, isID) {
		if (value) {
			if(_.isString(value)) {
				if (isID)
					value = value.replace(/^[^0-9a-zA-Z]+/, "").replace(/[^0-9a-zA-Z_-]/g, "_");
				else if (value.search(/[<>]/) >= 0)	
					value = _.escape(value);
			} else if (_.isObject(value)) {
				_.each(value, function(v, k) {
					value[k] = this.validate(v, isID);
				}, this);
			}
		}
		return value;
	},
	
	generateMacAddress: function(){
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
	},
	
	devicesCache: null
}

module.exports = devices;
