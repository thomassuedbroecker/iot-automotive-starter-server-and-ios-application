/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var Q = require('q');
var request = require('request');
var _ = require('underscore');
var fs = require('fs-extra');
var chance = require('chance')();
var moment = require('moment');
var debug = require('debug')('_app');
debug.log = console.log.bind(console);

var connectedDevices = require('./workbenchLib').connectedDevicesCache;
var simulationClientCtor = require('./devicesSimulation/simulationClient');
var simulationImporterCtor = require('./devicesSimulation/simulationImporter.js');
var driverInsightsAnalyze = require('./driverInsights/analyze.js');
var driverInsightsProbe = require('./driverInsights/probe.js');
var driverInsightsTripRoutes = require('./driverInsights/tripRoutes.js');
var contextMapping = require('./driverInsights/contextMapping.js');
var devices = require('./devices/devices.js');

var dbClient = require('./cloudantHelper.js');

//User environment variable for disabling car simulation
var DISABLE_DEMO_CAR_DEVICES = (process.env.DISABLE_DEMO_CAR_DEVICES || 'false') == 'true';

/*
 * *************** demo implementation of looking up device details ********************
 * For demo, generate a dummy info at random. The info can be the following JSON:
 * - name: "<who> car" as name of the car
 * - license: "<DDD-DD-DDDD>"
 * - model: a JSON object, one in _deviceModelInfoSamples.json or similar
 */
// this will be set to dbClient.onGettingNewDeviceDetails
var deviceModelSamples; // caches the template file in memory
var deviceModelSamplesNextSampleIndex = 0;
var onGettingNewDeviceDetails = function(device){
	console.log('Generating device details info for ' + device.deviceID + '...');
	// support functions
	function getDeviceModelInfo(){
		var samples = deviceModelSamples;
		if (!Array.isArray(samples)){
			samples = fs.readJsonSync('_deviceModelInfoSamples.json').templates;
			if (!samples){
				console.error('Failed to load ./_deviceModelInfoSamples.json');
				samples = [];
			}
			deviceModelSamples = samples;
		}
		// randomly pick one
		if (!samples || samples.length == 0)
			return {}
		return samples[(deviceModelSamplesNextSampleIndex++) % samples.length];
	}
	
	// prepare a new document property
	var doc = {
		name: chance.name() + ' car',
		license: chance.ssn(),
		model: getDeviceModelInfo()
	};
	return doc;
}

/*
 * *************** Simulated cars implementation ********************
 * 
 * This example uses simulated cars when no cars are available
 * for reservation. The simulated cars are implemented as follow:
 * 
 * - Pre request, create simulated devices
 *   - Using simulation client, create devices and start the simulation (devicesCache.reserveDevices)
 *     - the created devices are managed in devicesCache
 *     - they are also persist in the registeredDevices document in the mobilitystarterappdb DB
 *       * the devices simulation is resumed using the document
 *     - the devices properties (e.g. lat, lng) are updated per the request
 * - The devices are simulated in the simulation engine
 *   - They connect to IoT Foundation and send/recv MQTT messages
 */

// a function to be injected to 'reservation.js' to create simulated cars when cars are not available...
var onGetCarsNearbyPendingOp = null;
var getOnGetCarsNearbyPendingOp = function(){
	if(onGetCarsNearbyPendingOp && onGetCarsNearbyPendingOp.isPending()){
		return onGetCarsNearbyPendingOp;
	}
	return Q(); // resolved
}
var onGetCarsNearbyAsync = function(lat, lng, devicesNearBy){
	if (devicesNearBy && devicesNearBy.length > 0)
		return Q(devicesNearBy);
	
	var prevOps = getOnGetCarsNearbyPendingOp();
	var createNewDevices = Q.allSettled([prevOps])
		.then(function(){
			debug('Creating simulation cars...');
			//create 4 simulated cars for demo
			var createNewDevices = createSimulationAround(lat, lng , 4, 600).then(function(simDevices){
				return simDevices.map(_.clone);
			});
			return createNewDevices;
		});
	
	// poll the device cache for maximum 15 seconds to make sure all the devies are created
	var op = onGetCarsNearbyPendingOp = createNewDevices.then(function(newDevices){
		if(!newDevices || newDevices.length == 0)
			return Q([]); // resolve soon as nothing
		debug('  waiting for new simulation cars get connected...');
		var waitForDevicesGettingActive = function(newDevices){
			var start = Date.now();
			var deferred = Q.defer();
			var checkActive = function(){
				// ensure that the cars are connected
				var result = newDevices.map(function(device){
					var connectedDevice = connectedDevices.getConnectedDevice(device.deviceID);
					 // ensure that data comes from device
					if(connectedDevice && connectedDevice.lat && connectedDevice.lng){
						return connectedDevice;
					}
					return null;
				}).filter(function(cachedDevice){
					return !!cachedDevice;
				});
				// resolve when all gets ready
				if(newDevices.length == result.length){
					debug('  all new simulation cars are successfully connected to IoT Platform in %d seconds', (Date.now() - start)/ 1000);
					return deferred.resolve(result);
				}
				// wait for more unless timeout is reached
				if(Date.now() < start + 15000)
					return setTimeout(checkActive, 1000);
				// when some of devices are activated, resolve with the devices
				if(result.length > 0){
					console.error('WARNING: only %d of %d new simulation cars care connected to IoT Platform within 15 seconds.', result.length, newDevices.length);
					return deferred.resolve(result);
				}
				// otherwise, reject
				var msg = 'ERROR: none of new simulation cars is present in IoT Platform in 15 seconds.';
				console.error(msg);
				return deferred.resolve(result);
			};
			setTimeout(checkActive, 1000);
			return deferred.promise;
		};
		return waitForDevicesGettingActive(newDevices);
	})['finally'](function(){
		onGetCarsNearbyPendingOp = null; // not necessary but just in case
	});
	
	return op;
};

//a function to be injected to 'reservation.js' to add trip_id from simulated trips when reservation is completed
var onReservationClosed = function(reservation){
	// try to find the latest trip for the reserved car...
	function findLatestDeviceTrip(deviceID){
		debug('Trying to find trips for deviceID: ' + deviceID);
		return driverInsightsTripRoutes.getTripsByDevice(deviceID, 3)
			.then(function(trips){
				debug('Found ' + trips.length + ' recent trips for device: ' + deviceID);
				if(trips.length == 0)
					return null;
				//select based on duration of intersection of the actual trip time and reservation time
				var r = _.max(trips, function(trip){
					//get the duration
					var start = Math.max(reservation.actualPickupTime*1000, trip.org_ts);
					var end = Math.min(reservation.actualDropoffTime*1000 || Date.now(), trip.last_ts);
					var dur = end - start; // should be > 0 for valid trips
					debug('  overwrapped time duration is ' + dur + ' for the trip: ' + JSON.stringify(trip));
					debug('    reservation.actualPickupTime=' + reservation.actualPickupTime*1000);
					debug('    trip.org_ts=' + trip.org_ts);
					debug('    trip.last_ts=' + trip.last_ts);
					return (isNaN(dur) || dur < -30*1000)  ? NaN : dur; // give 30 seconds extension for fall-back. NaN not to pick it
				});
				if(r == -Infinity)
					return null; // not found
				debug('A trip route [' + r.trip_id + '] is selected for the reservation just clonsed on device ' + deviceID);
				return r;
			})['catch'](function(err){
				console.error('Caught error on searching trips by device: ', err);
				return null; // fall-back with reservation
			});
	}
	// pick one of simulated tirp nearby
	function pickSimulatedTrip(){
		debug('Trying to pick a simulated trip randomly...');
		pickupLocation = reservation.pickupLocation || {lat: 48.8, lng: 11.35}; // fallback to munich area
		var lat = pickupLocation.lat, lng = pickupLocation.lng;
		return simulationImporter.searchSimulatedTripsAround(lat, lng)
			.then(function(trips){
				debug('A simulation trip candidates detected. N=' + trips.length);
				if(trips.length == 0)
					return null;
				// pick one weighted by inverse of trip distance
				try{
					var r = chance.weighted(trips, trips.map(function(trip){
							debug('  considering a trip device=' + trip.deviceID + ', distance=' + trip.distance);
							if(isNaN(trip.distance)) return 0.1; // place it 100k kM away
							return Math.max(0, 10000.0 / (parseFloat(trip.distance) + 3.0)); // normalize 3km distance
						}));
					debug('A simulation trip route is selected for the reservation just clonsed on device: ' + JSON.stringify(r));
					return r;
				}catch(e){
					console.error('Caught error: ', e);
					return trips[0];
				}
			})['catch'](function(err){
				console.error('Caught error on searching simulated trips: ', err);
				return null; // fall-back with reservation
			});
	}
	
	var deviceID = reservation.carId;
	return findLatestDeviceTrip(deviceID).then(function(trip){
			return trip ? trip : pickSimulatedTrip(); // redirect to simulated trips when the trip is missing
		}).then(function(trip){
			if(trip){
				reservation.trip_id = trip.trip_id;
				reservation.trip_deviceID = trip.deviceID; // for debug
			}else{
				console.error("Failed to find a trip for reservation.")
			}
			return reservation;
		});
};

/*
 * Simulated cars session
 */
var simulationClient;
var simulationImporter;
var DB = null;

/**
 * Async create simulated cars around (lat, lng)
 * - Create simulated devices using the simulation client (devicesCache.reserveDevices)
 * - Move cars to (lat, lng) as well as setting car properties
 */
function createSimulationAround(lat, lng, numOfCars, radius){
	// handle default arg values
	numOfCars = (numOfCars)? numOfCars : 5;
	radius = (radius)? radius : 500;
	
	// prepare deferred functions for creating simulation
	function randCarAttributes(nRetry){
		var rndLocation = getRandomLocation(lat,lng, radius);
		return contextMapping.matchMapFirst(rndLocation.lat, rndLocation.lng).then(function(match){
			if(!match){
				if(nRetry > 0)
					return randCarAttributes(nRetry - 1); // retry
				console.log('  Tried to create a car around [%d,%d], but coudln\'t as there are no map-matched location.', lng, lat);
			}
			return match;
		})['catch'](function(er){
			console.error('  Tried to create a car around [%d,%d] and map match resulted in error. Using the raw location as fallback.', lng, lat);
			return {lat: rndLocation.lat, lng: rndLocation.lng};
		});
	}
	
	var functions = _(numOfCars).times(function(){ return randCarAttributes(1); });
	return Q.all(functions)
		.then(function(carAttrs){
			carAttrs = carAttrs.filter(function(carAttr){ return !!carAttr; });
			if(carAttrs.length == 0){
				debug('  cannot create car at the location. seems there is no road around.');
				return Q([]);
			}
			return allocateSimulationDevices("ConnectedCarDevice", carAttrs.length)
				.then(function(devices){
					var respDevices = devices.map(function(device, index){
						var respDevice = {deviceID: device.deviceID};
						Object.keys(carAttrs[index]).forEach(function(key){
							var value = carAttrs[index][key];
							simulationClient.setAttributeValue(device.deviceID, key, value.toString());
							respDevice[key] = value;
						});
						simulationClient.connectDevice(device.deviceID);
						return respDevice;
					}).filter(function(device){ return !!device; });
					return respDevices;
				});
		});
};

/**
 * Allocate "num" simulation devices of "devieType" type.
 * 
 * - Try to assign new devices for the device first
 *   - This tries to use devices which have already been registered to IoT Platform
 *   - Otherwise, tries to register new devices
 * - In case IoT Platform is full and failed to create new devices
 *   - Try to reuse some mostly elderly allocated devices where no reservation refers
 *   
 * Internally this manages MRU list of previously allocated device to determine
 * which devices to reuse. 
 * - Scenarios
 *   1. At 10:00: requests 4 devices, and devices D1, D2, D3, D4 are returned
 *   2. At 10:10: requests 4 devices, and devices D5, D6, D7, D8 are returned
 *   
 *   > At this point, the order is D4, D3, D2, D1, D8, D7, D6, D5.
 *     When the request interval are more than 10 min, all devices in the former overs the latter ones
 *   
 *   3. At 10:15: requests 4 devices, and devices D9, D10, D11, D12 are returned
 *   
 *   > At this point, the order is: D4, D3, D2, D1, D8, D7, D12, D6, D11, D5, D10, D9
 *     When the request interval is less than 10 min, the device order are merged depending on the the interval (ration of (the interval / 10min))
 */
var allocateSimulationDevices = (function(){
	var activeSimulationDevices = {}; // deviceID: { deviceID: [ID]last_access_ts: <millis Date.now()>, last_ord_adj: <millis> } 
	var sortedActiveSimualtionDevices = []; //
	// Update devices MRU list
	var updateAllocationHistory = function(deviceIDs){
		last_access_ts = Date.now();
		// update device timestamp
		deviceIDs.forEach(function(deviceID, index){
			var device = activeSimulationDevices[deviceID];
			if(!device){
				device = activeSimulationDevices[deviceID] = {deviceID: deviceID};
				sortedActiveSimualtionDevices.push(device);
			}
			device.last_access_ts = last_access_ts;
			device.last_ord_adj = (10 * 60 * 1000) * ((deviceIDs.length - index) / deviceIDs.length);
		});
		// sort
		sortedActiveSimualtionDevices.sort(function(a,b){
			// if the access is more than 5 min. before, order by (ts -> index)
			function w(d) { return d.last_access_ts + d.last_ord_adj; }
			return w(a) - w(b);
		});
	};
	// Find devices available for reuse
	var findReusableDeviceIDs = function(num){
		// "Reusable device" is a (1) connected, and (2) not in active reservations
		// - the result list should be ordered by preferred late, which is calculated based on Most-Recently-Used.
		var reusableDeviceCandidates = sortedActiveSimualtionDevices.slice(0, num*3).map(function(d){ return d.deviceID });
		debug('allocateSimulationDevices:   Rusable device candidates in order are: ', reusableDeviceCandidates);
		
		return dbClient.searchView('activeReservations', {keys: reusableDeviceCandidates})
		.then(function(result){
			// delete devices in active reservations
			var reserved = [].concat(result.rows).map(function(row){
				return row.key;
			});
			debug('allocateSimulationDevices:   Devices in active reservations are: ', reserved);
			var reusableDevices = reusableDeviceCandidates.filter(function(deviceID){
				return (reserved.indexOf(deviceID) === -1); // retain unused
			});
			debug('allocateSimulationDevices:   Reusable devices are: ', reusableDevices);
			return reusableDevices.splice(0, num);
		});
	};
	
	return function(devieType, num){
		var baseAllocDevices = Q(devicesCache.reserveDevices(devieType, num)).then(function(r){return r;})['catch'](function(er){
				debug('allocateSimulationDevices: Failed to create simulation devices. Trying to reuse existing devices...')
				return findReusableDeviceIDs(num).then(function(deviceIDs){
					debug('allocateSimulationDevices: Reusing devices: ', deviceIDs);
					if(deviceIDs && deviceIDs.length > 0){
						return devicesCache.reuseDevices(deviceIDs);
					}
					throw er; // throw the original error in case of there is no reusalbe devices
				});
			});
		return Q(baseAllocDevices).then(function(devices){
			updateAllocationHistory(_.pluck(devices, 'deviceID'));
			return devices;
		});
	};
})();

function startSimulation(){
	//
	// Start or resume simulation engine w/ cars which were in the previous session
	//
	var schemafileName = "./devicesSimulation/schemas.json";
	simulationClient = new simulationClientCtor({simulationConfigFile: schemafileName});
	simulationClient.on("error", function (err){
		console.error(err);
	});
	simulationClient.on('deviceConnectionError', function(deviceID, errMsg){
		// delete device that experienced connection error with 'Not authorized'
		if(errMsg && errMsg.indexOf('ot authorized') >= 0){ // Not authorized
			console.error('Deleting device [%s] due to deviceConnectionError: %s', deviceID, errMsg);
			devicesCache.deleteDevice({deviceID: deviceID, typeID: 'ConnectedCarDevice'}, true).done(function(){}, console.error.bind(console));
			setTimeout(function(){
				devicesCache.saveDevices();
				devices.removeCredentials({deviceID: deviceID, typeID: 'ConnectedCarDevice'}).done(function(){}, console.error.bind(console));
			}, 1000);
		}
	});
	
	// start engine
	dbClient.getDBClient()
	.then(function(db){
		DB = db; // set value to DB in this module
	})
	.then(function(){
		return devicesCache.loadDevices();
	})
	.then(function(){
		// terminate simulation engine
		console.log('Restarting the simulation engine...');
		return simulationClient.terminateSimulation()['catch'](function(err){ /*ignore*/ });
	})
	.then(function(){
		// start simulation engine
		_.delay(function(){
			simulationClient.startSimulation();
		}, 2000);
	})
	.done();
}

function startImportingDrivingHistories(){
	//
	// Import driving histories
	//
	simulationImporter = new simulationImporterCtor();
	_isProbeExist().then(function(isProbeExist){
		if(isProbeExist) return;

		simulationImporter.on("error", function(err){
			console.error(err);
		});
		var simulationDir = "./devicesSimulation/data/";
		fs.readdir(simulationDir, function(err, files){
			if(!files) return;
			files.forEach(function(file){
				if(file.endsWith(".fcd.xml")){
					simulationImporter.loadFcdSimulation(simulationDir + file);
				}else if(file.endsWith(".probe.json")){
					simulationImporter.loadJsonSimulation(simulationDir + file);
				}
			});
		});
	})['catch'](function(e){
		console.error('Error in simulation importer: ', e);
	}).done();
	
	// support func
	function _isProbeExist(){
		var deferred = Q.defer();
		driverInsightsProbe.getCarProbeDataListAsDate(function(probe){
			try{
				var probe = JSON.parse(probe);
				if(probe['error(getCarProbeDataListAsDate)']){
					deferred.reject(probe);
				}else{
					deferred.resolve(probe && probe.date && probe.date.length > 0);
				}
			}catch(ex){
				deferred.reject(ex);
			}
		});
		return deferred.promise;
	}
}

/**
 * Simulated devices tracking object
 */
var devicesCache = {};
devicesCache.freeDevices = {};
devicesCache.reservedDevices = {};
devicesCache.allDevices = [];
devicesCache.registeredDevicesDoc = {_id: "registeredDevices", devices: []};

/**
 * Recreate simulated devices from the database
 * - Load simulated devices from the `this.registeredDevicesDoc` document, and add them to the simulation engine
 */
devicesCache.loadDevices = function(filepath){
	var deferred = Q.defer();
	var _this = this;
	DB.get("registeredDevices",null,function(err,doc){
		if(!err){
			_this.registeredDevicesDoc = doc;
			_this.freeDevices = _.groupBy(_this.registeredDevicesDoc.devices, 'archDeviceGuid');
			_this.registeredDevicesDoc.devices.forEach(function(device){
				debug('Resuming device simulation... deviceID: ' + device.deviceID);
				simulationClient.addDevice(device);
			});
			deferred.resolve();
		}
		else if(err.error == 'not_found')
			deferred.resolve(); //no such doc yet
		else
			deferred.reject();
	});
	
	// schedule unreferenced IoT Platform devices cleanup process
	setTimeout((function(){
		deferred.promise.then(this._cleanupIoTPlatformDevices()).done();
	}).bind(this), 10000);
	
	return deferred.promise;
};

/*
 * This _app.js manages simulation car devices using "registeredDevices" document in
 * Cloudant DB. But it sometimes gets unsynced with devices registered to IoT Platform
 * and some in IoT Platform get unreferenced. This is to remove such unreferenced devices
 * from IoT Platform so that we can effectively use IoT Platform within its device 
 * number limit.
 */
devicesCache._cleanupIoTPlatformDevices = function(){
	debug('Start cleaning unreferenced car devices up...')
	var regDevices = (this.registeredDevicesDoc && this.registeredDevicesDoc.devices) || [];
	var regDeviceIdMap = _.indexBy(regDevices, 'deviceID');
	return devices.getAllDevices()
	.then((function(allDevices){
		var removeOps = allDevices.filter(function(device){
			if(device.typeId !== 'ConnectedCarDevice') return false;
			var registeredDoc = regDeviceIdMap[device.deviceId];
			if(registeredDoc) return false; // skip as the device is in the doc.
			debug('    found unreferenced car device [%s].', JSON.stringify(device));
			return true;
		}).map(function(device){
			device.deviceID = device.deviceId = device.deviceID || device.deviceId; // normalize
			device.typeID = device.typeId = device.typeID || device.typeId; // normalize
			return devices.removeCredentials(device); // delete device from IoT Platform
		});
		debug('  removing %d unreferenced car device in IoT Platform...', removeOps.length);
		return Q.allSettled(removeOps);
	}).bind(this))
	.then(function(){
		debug('  done cleaning up unreferenced car devices.');
	})['catch'](function(er){
		debug('  failed to clean up unreferenced car devices with exception: ', er);
	});
};

/**
 * Save the `this.registeredDevicesDoc` to store the current list of devices.
 * - retry 5 times not to leak IoT Platform devices
 */
devicesCache.saveDevices = function(nRetry){
	if(!nRetry){
		debug('UPDATE registeredDevices document is scheduled.');
	}
	nRetry = nRetry || 3; // give the default
	
	// stop scheduled one first
	if(this._saveDevicesRetryTimeout){
		clearTimeout(this._saveDevicesRetryTimeout);
		this._saveDevicesRetryTimeout = null;
	}
	
	var self = this;
	return Q(this._saveDevices())
	.then(function(){
		debug('  The registeredDevices document updated successfully.');
	})['catch'](function(er){
		if(nRetry > 0){
			// schedule retry
			console.error('Caught error on saving the registeredDevices document. Retry after 2 munites.', er);
			self._saveDevicesRetryTimeout = setTimeout((function(){
				self.saveDevices(nRetry - 1);
			}), 120*1000); // schedule after 120 seconds
		} else {
			console.error('ERROR: Caught error on saving the registeredDevices document. UNRECOVERABLE as retry count exceeded.', er);
			return Q.reject(er);
		}
	}).done(function(){}, console.error.bind(console));
};
devicesCache._saveDevicesRetryTimeout = null;

devicesCache._saveDevices = function(){
	var deferred = Q.defer();

	var getDB = function() {
		return DB ? Q(DB) :  dbClient.getDBClient().then(function(db) {
			DB = db;
			return db;
		});
	};
	
	var registeredDevices = this.registeredDevicesDoc;
	var updateDoc = function() {
		DB.insert(registeredDevices, null, function(err, doc){
			if(!err){
				registeredDevices._rev = doc._rev;
				deferred.resolve();
			}
			else
				deferred.reject();
		});
	};
	
	// start engine
	getDB().then(function(db){
		db.get(registeredDevices._id, null, function(err, doc) {
			if (!err) {
				registeredDevices._rev = doc._rev;
				updateDoc();
			} else if (err.statusCode === 404) {
				updateDoc();
			} else {
				deferred.reject();
			} 
		});
	})

	return deferred.promise;
}

/**
 * Save the `this.registeredDevicesDoc` to store the current list of devices
 */
devicesCache.deleteDevice = function(device, force){
	var deviceID = device.deviceID;
	if (!force && this.reservedDevices[deviceID]) {
		return Q.reject("Device is reserved.");
	}

	if (this.reservedDevices[deviceID]) {
		this.releaseDevice(device);
	}
	if (this.freeDevices[deviceID]) {
		delete this.freeDevices[deviceID];
	}
	this.registeredDevicesDoc.devices = this.registeredDevicesDoc.devices.filter(function(d) {
		return d.deviceID !== deviceID;
	});
	simulationClient && simulationClient.deleteDevice(deviceID);
	return Q(true);
}

// release devices
devicesCache.releaseDevice = function(device){
	simulationClient && simulationClient.disconnectDevice(device.deviceID);
	var deviceType = device.typeID;
	if (!deviceType) return;
	
	device.lastRunAttributesValues = [];
	this.freeDevices[deviceType] = (this.freeDevices[deviceType])? this.freeDevices[deviceType] : [];
	this.freeDevices[deviceType].push(device);
	delete this.reservedDevices[device.deviceID];
};

/**
 * Reuse connected device(s) - Promise
 * - This is a shortcut method for releasing and then reserving devices.
 *   But this doesn't manipulate any device management vars (e.g. freeDevices, resrvedDevices) for stability
 */
devicesCache.reuseDevices = function(deviceIDs){
	var this_ = this;
	var reuseDevice = function(deviceID){
		var device = this_.reservedDevices[deviceID];
		if(!device){
			console.error('ERROR: Trying to reuse disconnected device: ' + deviceID);
			return Q.reject(); // precondition not met
		}
		try{
			simulationClient && simulationClient.disconnectDevice(deviceID);
			device.lastRunAttributesValues = [];
			return Q(device);
		}catch(e){
			return Q.reject(e);
		}
	};
	return Q.all([].concat(deviceIDs).map(reuseDevice)).delay(1000); // TODO ad-hoc 1 second delay for no promise on disconnectDevice
}

/**
 * Reserve devices for this simulation
 */
devicesCache.reserveDevices = function(deviceType, numOfDevices){
	var reservation = [];
	var nameIndex = _.indexBy(simulationClient.simulationConfig.devicesSchemas, "name");
	var typeGuid = nameIndex[deviceType].guid;
	this.freeDevices[typeGuid] = (this.freeDevices[typeGuid])? this.freeDevices[typeGuid] : [];
	var freeDevices = this.freeDevices[typeGuid];
	while(freeDevices.length > 0 && reservation.length < numOfDevices) {
		var device = freeDevices.pop();
		this.reservedDevices[device.deviceID] = device;
		reservation.push(device);
	}

	var howMuch2Create  = numOfDevices - reservation.length;
	if(howMuch2Create > 0){
		var _this = this;
		howMuch2Create = (howMuch2Create <= 30) ? howMuch2Create : 30;
		console.log('Creating ' + howMuch2Create + ' devices in the simulation engine...');
		var op = simulationClient.createDevices(deviceType, howMuch2Create).then(
				function(devices){
					debug(' ' + devices.length + ' devices are newly created');
					devices.forEach(function(device){
						_this.registeredDevicesDoc.devices.push(device);
						if(reservation.length < numOfDevices){
							_this.reservedDevices[device.deviceID] = device;
							reservation.push(device);
						}
						else{
							_this.freeDevices[typeGuid].push(device);
						}
					}, _this);
					_this.saveDevices();
					return Q(reservation);
				})['catch'](function(err){
					console.error(err);
					if(reservation.length > 0) // even when it's fail to create new devices, resolve the promise with available devices
						return Q(reservation);
					return Q.reject({
						status: 500, 
						message: 'Failed to create new demo car devices: ' + (err.message || (err.data && err.data.message) || 'see console log for the details')
					});
				});
		return Q(op);
	}
	return Q(reservation);
};

devices.devicesCache = devicesCache;

/*
 * ****************** Generic Utility Functions ***********************
 */

/**
 * Get randomely placed position `{lat: x, lng: y}` within a circle.
 */
function getRandomLocation(latitude, longitude, radiusInMeters) {

	var getRandomCoordinates = function (radius, uniform) {
		// Generate two random numbers
		var a = Math.random(), b = Math.random();
		// Flip for more uniformity.
		if (uniform) {
			if (b < a) {
				var c = b;
				b = a;
				a = c;
			}
		}

		// It's all triangles.
		return [
			b * radius * Math.cos(2 * Math.PI * a / b),
			b * radius * Math.sin(2 * Math.PI * a / b)
		];
	};

	var randomCoordinates = getRandomCoordinates(radiusInMeters, true);

	// Earths radius in meters via WGS 84 model.
	var earth = 6378137;

	// Offsets in meters.
	var northOffset = randomCoordinates[0],
	eastOffset = randomCoordinates[1];

	// Offset coordinates in radians.
	var offsetLatitude = northOffset / earth,
	offsetLongitude = eastOffset / (earth * Math.cos(Math.PI * (latitude / 180)));

	// Offset position in decimal degrees.
	return {
		lat: latitude + (offsetLatitude * (180 / Math.PI)),
		lng: longitude + (offsetLongitude * (180 / Math.PI))
	};
};


/**
 * Initialize the car simulation session for the demo.
 */
(function(){
	// enable car simulation
	if (!DISABLE_DEMO_CAR_DEVICES){
		startSimulation()
		// set simulated cars for the reservation router
		var deviceRouter = require('./routes/user/device.js');
		deviceRouter.onGetCarsNearbyAsync = onGetCarsNearbyAsync;
		var reservationRouter = require('./routes/user/reservation.js');
		reservationRouter.onReservationClosed = onReservationClosed;
	}
	
	// enable driving history
	startImportingDrivingHistories();
	
	// start driving event import
	var drivingBaseRouter = require('./routes/monitoring/drivingDataSync.js');
	if(drivingBaseRouter.initSync){
		drivingBaseRouter.initSync().then(function(){
			console.log('Initial synchronization of monitoring console data completed.');
		})['catch'](function(e){
			console.log('Initial synchronization of monitoring console data failed: ', e);
		}).done();
	}
	
	// give virtualCars access to simulationImporter for pre-simulated trip_routes
	var virtualCar = require('./devicesSimulationEngine/virtualCar.js');
	virtualCar.simulationImporter = simulationImporter;
	
	// enable dummy car details info
	dbClient.onGettingNewDeviceDetails = onGettingNewDeviceDetails;

	requestJobEveryDay(true);
})();

function requestJobEveryDay(skip){
	if(!skip){
		var yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");
		driverInsightsAnalyze.sendJobRequest(yesterday, yesterday);
		debug("Request Analyzing for " + yesterday + " probes");
	}
	var timer = moment().endOf("day").valueOf() - Date.now() + 10000;
	debug("Set job request after: " + timer + "ms");
	setTimeout(requestJobEveryDay, timer);
};
