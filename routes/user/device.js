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
 * REST apis for car devices
 */
var router = module.exports = require('express').Router();
var Q = require('q');
var _ = require('underscore');
var debug = require('debug')('device');
debug.log = console.log.bind(console);

var connectedDevices = require('../../workbenchLib').connectedDevicesCache;
var contextMapping = require('../../driverInsights/contextMapping.js');
var recommendation = require('./recommend/recommendation.js');
var devices = require('../../devices/devices.js');

var dbClient = require('../../cloudantHelper.js');
var authenticate = require('./auth.js').authenticate;

var request = require("request");

//get CD client
var DB = null;
dbClient.getDBClient().then(function(db){
	DB = db;
});

/*
 * Find cars nearby the specific location.
 * For the demonstration, if there is no cars,
 * create several cars automatically around the location.
 */
router.get('/carsnearby/:lat/:lng', function(req, res) {
	var ownerId = req.get("iota-starter-uuid"); 
	getCarsNearBy(ownerId, req.params.lat, req.params.lng).then(function(devices){
		return res.send(devices);
	})['catch'](function(err){
		console.error('error: ' + JSON.stringify(err))
		if(err.status||err.statusCode)
			return res.status(err.status||err.statusCode).send(err.message || (err.data && err.data.message) || err);
		else{
			return res.status(500).send(err);
		}
	}).done();
});


/*
 * Find available cars nearby the specific location between specified time range.
 * For the demonstration, if there is no cars,
 * create several cars automatically around the location.
 * stime and etime are specified in UNIX seconds
 */
router.get('/carsnearby/:lat/:lng/:stime/:etime', function(req, res) {
	var ownerId = req.get("iota-starter-uuid"); 
	getCarsNearBy(ownerId, req.params.lat, req.params.lng, req.params.stime, req.params.etime).then(function(devices){
		return res.send(devices);
	})['catch'](function(err){
		console.error('error: ' + JSON.stringify(err))
		if(err.status||err.statusCode)
			return res.status(err.status||err.statusCode).send(err.message || (err.data && err.data.message) || err);
		else{
			return res.status(500).send(err);
		}
	}).done();
});


/**
 * get all devices
 */
router.get('/device', authenticate, function(req,res) {
	devices.getAllDevices().then(function(results) {
		res.send(results);
	})['catch'](function(err){
		res.status((err&&(err.status||err.statusCode))||500).send(err);
	});
});

/*
 * Find available cars nearby the specific location between specified time range.
 * For the demonstration, if there is no cars,
 * create several cars automatically around the location.
 * stime and etime are specified in UNIX seconds
 */
router.get('/device/recommendation/:deviceId/:lat/:lng/:stime/:etime', function(req, res) {
	getRecommendationRate(req.params.deviceId, req.params.lat, req.params.lng, req.params.stime, req.params.etime).then(function(device){
		return res.send(device);
	})['catch'](function(err){
		console.error('error: ' + JSON.stringify(err))
		if(err.status||err.statusCode)
			return res.status(err.status||err.statusCode).send(err.message || (err.data && err.data.message) || err);
		else{
			return res.status(500).send(err);
		}
	}).done();
});

/*
 * get device credentials for IoT Platform
 */
var device_credentials = dbClient.getDB("device_credentials");

router.get('/device/credentials/:deviceId', authenticate, function(req,res){
	var deviceId = req.params.deviceId;
	var ownerId = req.query && req.query.ownerOnly && req.get("iota-starter-uuid");
	var token = devices.getCredentials({deviceID: deviceId, ownerID: ownerId}, true).then(function(creds){
		res.send(creds);
	})["catch"](function(err){
		console.error('error: ' + JSON.stringify(err))
		if(err.status||err.statusCode)
			return res.status(err.status||err.statusCode).send(err.message || (err.data && err.data.message) || err);
		else{
			return res.status(500).send(err);
		}
	}).done();
});

/*
 * ****************** Get Cars Near By Functions ***********************
 */
/*
 * Get cars nearby
 */
var carsNearByCriticalSection = null;
function getCarsNearBy(ownerId, lat, lng, stimeInSec, etimeInSec){
	
	var param = normalizeReservationParam(lat, lng, stimeInSec, etimeInSec);
	
	// lat and lng variables in this call object are shared among all closures
	lat = param.latitude;
	lng = param.longitude;
	
	// do mapMatch and update the (lat,lng) to matched ones
	function matchMapOrigin(){
		// do matchMap with error-fallback option
		return Q.allSettled([contextMapping.matchMap(lat, lng), 'default'])
				.spread(function(matchResult, defaultResult){
					if (matchResult.state == 'fulfilled'){
						lat = matchResult.value.lat;
						lng = matchResult.value.lng;
					}
				});
	}
	
	function findExistingCarsNearBy(){
		var devices = connectedDevices.getConnectedDevices();
		var devicesNearBy = devices.filter(function(device){
			if(!device.lat || !device.lng)
				return false;
			var distance = getDistance(
					{latitude: device.lat, longitude: device.lng},
					{latitude: lat, longitude: lng}
			);
			return distance < 1000;//first filter out those who are in radius of 1000
		}).map(_.clone);
		return devicesNearBy;
	}
	
	function filterOutUnreservedCars(devices){
		var devicesIds = _.pluck(devices, 'deviceID');
		return dbClient.searchView('activeReservations', {keys: devicesIds}).then(function(result){
			var activeDeviceIds = _.pluck(result.rows, 'key');
			var result = devices.filter(function(device){
				return activeDeviceIds.indexOf(device.deviceID) < 0; // retain if missing
			});
			return result;
		});
	}
	
	function filterOutOtherOwnerCars(devices){
		var devicesIds = _.pluck(devices, 'deviceID');
		return dbClient.searchView('privateDevices', {keys: devicesIds}).then(function(result){
			return devices.filter(function(device){
				return !result.rows.some(function(privateDevice) {
					// filter out devices owned by different user
					return privateDevice.key === device.deviceID && privateDevice.value.ownerId !== ownerId;
				});
			});
		});
	}
	
	function reviewAndUpdateList(devicesNearBy){
		// expand car list if necessary
		if (router.onGetCarsNearbyAsync){
			// user exit to allow demo-cars around
			return router.onGetCarsNearbyAsync(lat, lng, devicesNearBy)
				.then(filterOutUnreservedCars);
		}else{
			return Q(devicesNearBy);
		}
	}
	
	function appendDistance(devices){
		// add route distance to all devices
		return Q.all(devices.map(function(device){
			return contextMapping.routeDistance(lat, lng, device.lat, device.lng)
					.then(function(dist){ 
						device.distance = dist; 
						return device; 
					});
				}));
	}
	
	function appendRecommendedRate(devices) {
		if (!devices || devices.length == 0 || isNaN(param.stimeInSec))
			return Q(devices);
		
		return recommendation.precalcRecommendedRate(param).then(function() {
			return Q.all(devices.map(function(device) {
				return recommendation.calcRecommendedRate(device, param).then(function(rate) {
					device.recommendation = rate;
					return device;
				});
			}));
		});
	}
	
	//
	// Create critical section for creating cars
	// - This is to create a synchronized operation which includes
	//   - find existing cars, test the availabilities, create three new cars if no available
	// - Without critical section, the logic above can create three new cars simultaneously and
	//   it's unexpected behaviro which results in so many cars are in one place.
	//
	function criticalSectionToGetCars(){
		var base;
		if(carsNearByCriticalSection && carsNearByCriticalSection.isPending()){
			base = carsNearByCriticalSection;
		}else{
			base = Q();
		}
		return carsNearByCriticalSection = base
			.then(function(){
				debug('CRITICAL_SECTION: Entering critical section');
			})
//			.then(waitForPendingOps).
			.then(findExistingCarsNearBy)
			.then(filterOutUnreservedCars)
			.then(filterOutOtherOwnerCars)
			.then(reviewAndUpdateList)['finally'](function(){
				carsNearByCriticalSection = null;
				debug('CRITICAL_SECTION: Leaving critical section');
			});
	}
	
	return matchMapOrigin()
		.then(dbClient.cleanupStaleReservations)
		.then(criticalSectionToGetCars) // see above
		.then(appendDistance)
		.then(dbClient.getDeviceDetails)
		.then(appendRecommendedRate); // must be called after getting device details
}

//Callback onGetCarsNearby: override & respond with - function(lat,lng,carsNearBy)
//- carsNearBy is an array containing cars
router.onGetCarsNearbyAsync = null;

function getRecommendationRate(deviceId, lat, lng, stimeInSec, etimeInSec) {
	return dbClient.getExistingDeviceDetails({deviceID: deviceId}).then(function(deviceDetails) {
		var params = normalizeReservationParam(lat, lng, stimeInSec, etimeInSec);
		return recommendation.precalcRecommendedRate(params).then(function() {
			return recommendation.calcRecommendedRate(deviceDetails, params).then(function(rate) {
				return rate;
			});
		});
	});
};

function normalizeReservationParam(lat, lng, stimeInSec, etimeInSec) {
	// lat and lng variables in this call object are shared among all closures
	lat = (_.isString(lat)) ? parseFloat(lat) : lat;
	lng = (_.isString(lng)) ? parseFloat(lng) : lng;
	lng = ((lng + 180) % 360) - 180; // re-range to [-180,180)

	// stimeInSec and etimeInSec variables that indicates time range are shared among all closures
	if (stimeInSec === "now") {
		stimeInSec = Math.floor(Date.now()/1000); // current time in unix seconds
	} else if (!isNaN(stimeInSec)) {
		stimeInSec = (_.isString(stimeInSec)) ? parseInt(stimeInSec) : stimeInSec;
	}

	if (_.isString(etimeInSec) && etimeInSec.length > 0 && etimeInSec.charAt(0) === '+') {
		etimeInSec = stimeInSec + parseInt(etimeInSec.substr(1));
	} else if (!isNaN(etimeInSec)) {
		etimeInSec = (_.isString(etimeInSec)) ? parseInt(etimeInSec) : etimeInSec;
	}
	if (isNaN(etimeInSec)) etimeInSec = stimeInSec;

	return {latitude: lat, longitude: lng, stimeInSec: stimeInSec, etimeInSec: etimeInSec};
};

/*
 * ****************** Generic Utility Functions ***********************
 */

/**
 * Calculate distance in meters between two points on the globe
 * - p0, p1: points in {latitude: [lat in degree], longitude: [lng in degree]}
 */
function getDistance(p0, p1) {
	// Convert to Rad
	function to_rad(v) {
		return v * Math.PI / 180;
	}
	var latrad0 = to_rad(p0.latitude);
	var lngrad0 = to_rad(p0.longitude);
	var latrad1 = to_rad(p1.latitude);
	var lngrad1 = to_rad(p1.longitude);
	var norm_dist = Math.acos(Math.sin(latrad0) * Math.sin(latrad1) + Math.cos(latrad0) * Math.cos(latrad1) * Math.cos(lngrad1 - lngrad0));
	
	// Earths radius in meters via WGS 84 model.
	var earth = 6378137;
	return earth * norm_dist;
};
