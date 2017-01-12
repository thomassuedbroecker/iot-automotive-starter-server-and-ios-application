/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
module.exports = simulationImporter;
var _ = require("underscore");
var util = require('util');
var EventEmitter = require('events');
var Q = require("q");
var fs = require('fs-extra');
var request = require('request');
var xml2js = require('xml2js');
var moment = require('moment');
var uuid = require('node-uuid')
var debug = require('debug')('simulationImporter');
debug.log = console.log.bind(console);

var driverInsightsProbe = require('../driverInsights/probe');
var driverInsightsAnalyze = require('../driverInsights/analyze');
var driverInsightsTripRoutes = require('../driverInsights/tripRoutes.js');

var IMPORT = process.env.IMPORT ? new Boolean(process.env.IMPORT) : true;
var MAX_NUM_OF_REQUESTING = new Number(process.env.MAX_NUM_OF_REQUESTING || 10);
var requestQueue = [];
var requesting = 0;

var SIM_CAR_DEVICE_ID_PREFIX = "Sim_Car_";

function simulationImporter(config) {
	if (!(this instanceof simulationImporter)) {
		return new simulationImporter(config);
	}
	EventEmitter.call(this);
	config = (config) ? config :{};
	this.simulationConfig = {sessionid: (config.sessionid)?config.sessionid:null, devicesSchemas: [], devices: []};
	if(config.simulationConfigFile)
		this.loadSimulation(config.simulationConfigFile);
};
//Inherit functions from `EventEmitter`'s prototype
util.inherits(simulationImporter, EventEmitter);

simulationImporter.prototype.FIRST_JOB_REQUEST_TIME = new Number(process.env.FIRST_JOB_REQUEST_TIME || 180000);
simulationImporter.prototype.loadFcdSimulation = function(fcdDataPath){
	if(!IMPORT) return;

	var location = _getLocation(fcdDataPath);
	var parser = new xml2js.Parser();
	startTimeForEachTrip = {};
	fs.readFile(fcdDataPath, function(err, data){
		if(err) throw err;

		parser.parseString(data, function (err, json) {
			var timesteps = json["fcd-export"].timestep || [];
			var uuidMap = {};
			var tripRoutes = {};
			timesteps.forEach(function(timestep, timestepIndex){
				var vehicles = timestep.vehicle || [];
				vehicles.forEach(function(vehicle, vehicleIndex){
					var vehicleId = new Number(vehicle.$.id);

					var mo_id = SIM_CAR_DEVICE_ID_PREFIX + location + "_" + vehicleId;
					var trip_id = vehicle.$.trip_id || uuidMap[mo_id];
					if(!trip_id){
						trip_id = uuidMap[mo_id] = uuid.v1();
					}
					var startTime = startTimeForEachTrip[trip_id];
					if(!startTime){
						startTime = startTimeForEachTrip[trip_id] = Date.now() - Math.round(Math.random()*86400000);
					}
					var timestamp = (new Date(Number(timestep.$.time)*1000 + startTime)).getTime();

					// Use pre map-matched value if available
					var payload = {
							lat: vehicle.$.matched_latitude || vehicle.$.y,
							lng: vehicle.$.matched_longitude || vehicle.$.x,
							ts: timestamp,
							speed: vehicle.$.speed,
							id: mo_id,
							trip_id: trip_id
					};
					if(vehicle.$.road_type){
						payload.road_type = vehicle.$.road_type;
					}
					if(vehicle.$.matched_link_id){
						payload.matched_link_id = vehicle.$.matched_link_id;
					}
					if(vehicle.$.matched_heading){
						payload.matched_heading = vehicle.$.matched_heading;
					}

					_handleTimestep(payload, tripRoutes);
				});
			});

			driverInsightsTripRoutes.insertTripRoutes(tripRoutes);
		});
	});
};

var jsonMoId = 0;
simulationImporter.prototype.loadJsonSimulation = function(jsonDataPath){
	if(!IMPORT) return;

	var location = _getLocation(jsonDataPath);
	var start_ts = null;
	fs.readJson(jsonDataPath, function(err, data){
		jsonMoId++;
		if(!Array.isArray(data) || data.length <= 0){
			return;
		}
		var ts_offset = Date.now() - moment(data[0].timestamp).valueOf() - Math.round(Math.random()*86400000);
		var tripRoutes = {};
		data.forEach(function(timestep, timestepIndex){
			var timestamp = (new Date(timestep.timestamp)).getTime() + ts_offset;
			// Use pre map-matched value if available
			var payload = {
					lat: timestep.matched_latitude || timestep.latitude,
					lng: timestep.matched_longitude || timestep.longitude,
					ts: timestamp,
					speed: String(timestep.speed),
					id: SIM_CAR_DEVICE_ID_PREFIX + location + "_" + jsonMoId,
					trip_id: timestep.trip_id
			};
			if(timestep.road_type){
				payload.road_type = timestep.road_type;
			}
			if(timestep.matched_link_id){
				payload.matched_link_id = timestep.matched_link_id;
			}
			if(timestep.matched_heading){
				payload.matched_heading = timestep.matched_heading;
			}

			_handleTimestep(payload, tripRoutes);
		});
		driverInsightsTripRoutes.insertTripRoutes(tripRoutes);
	});
};

var _getLocation = function(filepath){
	var location = filepath.substring(filepath.lastIndexOf("/") + 1) || filepath;
	location = location.substring(0, location.indexOf(".")) || location;
	return location;
};
var _handleTimestep = function(payload, tripRoutes){
	var trip = tripRoutes[payload.trip_id];
	if(!trip){
		trip = tripRoutes[payload.trip_id] = {_id: payload.trip_id, routes: []};
	}
	trip.routes.push(payload);

	if(requesting < MAX_NUM_OF_REQUESTING){
		_requestSendProbe(payload.id, payload, _requestSendProbeCallback);
	}else{
		requestQueue.push(payload);
	}
	
	// timer function
	if (requestQueue.length > 0 && !_handleTimeStepIntervalTimerId) {
		_handleTimeStepIntervalTimerId = setInterval(function(){
			if (requestQueue.length > 0) {
				console.log('simulationImporter: Remaining queue length for sendProbeData is: ' + requestQueue.length);
			}
			else {
				console.log('simulationImporter: No more data left for sendProveData. Stop queue length monitoring.');
				clearInterval(_handleTimeStepIntervalTimerId);
				_handleTimeStepIntervalTimerId = null;
			}
		}, 30000);
	}
};
var _handleTimeStepIntervalTimerId = undefined;

var _requestSendProbeCallback = function(){
	requesting--;
	if(requestQueue.length === 0 || requesting === 0){
		debug("_requestSendProbeCallback: " + requestQueue.length + ", " + requesting)
	}
	if(requestQueue.length <= 0 && requesting === 0){
		var yesterday = moment().subtract(1, "days").format("YYYY-MM-DD");
		var today = moment().format("YYYY-MM-DD");
		driverInsightsAnalyze.sendJobRequest(yesterday, yesterday);
		driverInsightsAnalyze.sendJobRequest(today, today);
	}else{
		var queuedPayload = requestQueue.shift();
		if(queuedPayload){
			_requestSendProbe(queuedPayload.id, queuedPayload, _requestSendProbeCallback);
		}
	}
};
var _requestSendProbe = function(deviceId, payload, callback){
	requesting++;
	debug("now requesting: " + requesting + ", num of queue: " + requestQueue.length);
	var mapMatch = null;
	if(payload.matched_heading){
		mapMatch = function(deviceType, deviceId, payload){
			var m = moment(payload.ts);
			var prob = {
					"timestamp": m.format(), // ISO8601
					"matched_longitude": payload.lng,
					"matched_latitude": payload.lat,
					"matched_heading": payload.matched_heading,
					"matched_link_id": payload.matched_link_id || payload.link_id,
					"speed": payload.speed,
					"mo_id": payload.id,
					"trip_id": payload.trip_id
				};
			return Q(prob);
		};
	}else{
		mapMatch = driverInsightsProbe.mapMatch;
	}
	
	mapMatch("Car_Sim", deviceId, payload).then(function(prob){
		if(!prob.road_type && payload.road_type){
			prob.road_type = payload.road_type;
		}
		driverInsightsProbe.sendProbeData([prob], callback);
	}, callback);
};

//search demo trips ordered by the distance between the given point and the trip origin
//- row[i].distance carries the distance in kilometer
simulationImporter.prototype.searchSimulatedTripsAround = function(lat, lng, limit){
	return driverInsightsTripRoutes._searchTripsIndex({
		q:'deviceID:'+SIM_CAR_DEVICE_ID_PREFIX+'*', // within simulated cars
		sort: '<distance,org_lng,org_lat,'+lng+','+lat+',km>',
		limit: (limit || 5)
	}).then(function(result){
		return result.rows.map(function(row){
			row.fields.distance = row.order && row.order[0];
			return row.fields;
		});
	});
};

