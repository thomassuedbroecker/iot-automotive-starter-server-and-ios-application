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
 * REST apis for car reservation
 */
var router = module.exports = require('express').Router();
var Q = require('q');
var _ = require('underscore');
var debug = require('debug')('reservation');
debug.log = console.log.bind(console);

var IOTF = require('../../watsonIoT');
var connectedDevices = require('../../workbenchLib').connectedDevicesCache;
var weatherInsights = require('../../weatherInsights/weatherInsights.js');

var dbClient = require('../../cloudantHelper.js');
var notificationUtils = require('../../notificationUtils.js');
var authenticate = require('./auth.js').authenticate;
var appEnv = require('cfenv').getAppEnv();

//get CD client
var DB = null;
dbClient.getDBClient().then(function(db){
	DB = db;
});

var validator = new Validator();

var THRESHOLD_TO_NOTIFY_RAIN = 1;
var THRESHOLD_TO_NOTIFY_SNOW = 1;

/*
 * get all active reservations for a login user
 */
router.get('/activeReservations', authenticate, function(req, res) {
	getReservations(req.user.id, true).then(function(reservations){
		debug(JSON.stringify(reservations));
		return res.send(reservations);
	})["catch"](function(err){
		if(err.status)
			return res.status(err.status).send(err.message);
		else
			return res.status(500).send(err);
	});
});

/*
 * get all reservations for a login user
 */
router.get('/reservation', authenticate, function(req, res) {
	getReservations(req.user.id, false).then(function(reservations){
		debug(JSON.stringify(reservations));
		return res.send(reservations);
	})["catch"](function(err){
		if(err.status)
			return res.status(err.status).send(err.message);
		else
			return res.status(500).send(err);
	}).done();
});

/*
 * get a reservation - response the reservation
 */
router.get('/reservation/:reservationId', authenticate, function(req, res) {
	getActiveUserReservation(req.params.reservationId, req.user.id).then(
		function(reservation){
			debug(JSON.stringify(reservation));
			return res.send(reservation);
		}
	)["catch"](function(err){
		if(err.status)
			return res.status(err.status).send(err.message);
		else
			return res.status(500).send(err);
	}).done();
});

/*
 * create reservation - response the reservation ID
 */
router.post('/reservation', authenticate, function(req, res) {
	if(!req.body.carId || !validator.isNumeric(req.body.pickupTime) || !validator.isNumeric(req.body.dropOffTime))
		return res.status(400).send("missing request params");
	dbClient.searchView('activeReservations', {key: req.body.carId}).then(function(result){
		if(result.rows.length > 0)
			return res.status(409).send("car already taken");
		//create reservation
		var reservation = {
				type: "reservation",
				carId: validator.escapeId(req.body.carId),
				pickupTime: req.body.pickupTime,
				dropOffTime: req.body.dropOffTime,
				userId: validator.escapeId(req.user.id),
				status: "active"
		};
		if(req.body.deviceId){
			reservation.deviceId = validator.escapeId(req.body.deviceId);
		}
		var device = connectedDevices.getConnectedDevice(reservation.carId);
		if(device) {
			device.status = "Locked";
		}
		DB.insert(reservation ,null, function(err, doc){
			if(err){
				console.error(err);
				return res.status(500).end();
			}
			return res.send({reservationId : doc.id});
		});
	}).done();
});

/*
 * update a reservation - response the update reservation
 */
router.put('/reservation/:reservationId', authenticate, function(req, res) {
	if(!req.body.pickupTime && !req.body.dropOffTime && !req.body.status)
		return res.status(204).end();
	getActiveUserReservation(req.params.reservationId, req.user.id).then(
		function(reservation){
			if(reservation.actualPickupTime && req.body.pickupTime){
				console.error("Failed to update a reservation: car already pickedup");
				return res.status(400).send("car already pickedup");
			}
			if(req.body.trip_id) reservation.trip_id = req.body.trip_id; 

			var promise = Q(reservation);
			if(req.body.status && req.body.status.toUpperCase() == "CLOSE"){
				IOTF.sendCommand("ConnectedCarDevice", reservation.carId, "lock");
				reservation.status = "closed";
				reservation.actualDropoffTime = Math.floor(Date.now()/1000);
				debug('Testing if call onReservationClosed or not');
				if (!reservation.trip_id && router.onReservationClosed){
					debug(' -- calling onReservationClosed...');
					promise = router.onReservationClosed(reservation);
				}
			}

			reservation.pickupTime = validator.isNumeric(req.body.pickupTime) ? req.body.pickupTime : reservation.pickupTime;
			reservation.dropOffTime = validator.isNumeric(req.body.dropOffTime) ? req.body.dropOffTime : reservation.dropOffTime;

			promise.then(function(reservation){
				DB.insert(reservation ,null, function(err, result){
					if(err){
						console.error(err);
						return res.status(500).end();
					}
					reservation._rev = res.rev;
					var device = connectedDevices.getConnectedDevice(reservation.carId);
					if(device)
						reservation.carDetails = device;

					cancelWeatherNotification(reservation);
					return res.send(reservation);
				});
			}).done();
		}
	)["catch"](function(err){
		console.error(err);
		if(err.status)
			return res.status(err.status).send(err.message);
		else
			return res.status(500).send();
	}).done();
});

/*
 * cancel reservation - response 'canceled;
 */
router['delete']('/reservation/:reservationId', authenticate, function(req, res) {
	DB.get(req.params.reservationId ,null,function(err,reservation) {
		if(err){
			if(err.error == 'not_found')
				return res.status(404).send("no such reservation " + _.escape(req.params.reservationId));
			else{
				console.error(err);
				return res.status(500).end();
			}
		}
		if( (reservation.userId !== req.user.id) || (reservation.status !== "active") ){
			console.error("this reservation is not active or was not made by this user.");
			return res.status(404).send("no such reservation " + _.escape(req.params.reservationId));
		}
		reservation.status = "canceled";
		DB.insert(reservation ,null, function(err, result){
			if(err){
				console.error(err);
				return res.status(500).end();
			}
			cancelWeatherNotification(reservation);
			return res.send('canceled');
		});
	});
});

/*
 * Control a car:
 * Support only lock and unlock commands.
 */
router.post('/carControl', authenticate, function(req, res) {
	if(!req.body.reservationId && !req.body.command) // req.body.location
		return res.status(404).end("missing body");
	return getActiveUserReservation(req.body.reservationId, req.user.id).then(
		function(reservation){
			var device = connectedDevices.getConnectedDevice(reservation.carId);
			if(!device)
				return res.status(500).send("Device is offline");

			if(req.body.command.toUpperCase()  == "LOCK"){
				IOTF.sendCommand("ConnectedCarDevice", device.deviceID, "lock");
				device.status = "Locked";
				reservation.carDetails = device;
				return res.send(reservation);
			}
			else if(req.body.command.toUpperCase()  == "UNLOCK"){
				IOTF.sendCommand("ConnectedCarDevice", device.deviceID, "unlock");
				if(!reservation.pickupLocation || !reservation.actualPickupTime){//if this is first unlock update reservation
					reservation.pickupLocation = {lat: device.lat, lng: device.lng};
					reservation.actualPickupTime = Math.floor(Date.now() / 1000);
					reservation.status = "driving";
					DB.insert(reservation ,null, function(err, result){});
				}
				device.status = "Unlocked";
				reservation.carDetails = device;
				if(reservation.deviceId){
					reservation.dropOffLocation = {lat: device.lat, lng: device.lng};
					setWeatherNotification(reservation);
				}
				return res.send(reservation);
			}

		}
	)["catch"](function(err){
		console.error(err);
		if(err.status)
			return res.status(err.status).send(err.message);
		else
			return res.status(500).send();
	});
});

router.get('/ui/reservation', authenticate, function(req, res) {
	res.render("reservation", {});
});

//Callback onGetCarsNearby: override & respond with - function(lat,lng,carsNearBy)
//- carsNearBy is an array containing cars
router.onReservationClosed = null;

/*
 * ****************** Reservation Functions ***********************
 */
/*
 * Get reservations for a user
 */
function getReservations(userid, activeOnly){
	var viewName = activeOnly ? 'activeReservations' : 'allReservations';
	return dbClient.searchView(viewName, {key: userid})
		.then(function(result){
			// get reservations
			var reservations = result.rows.map(function(item){
				var reservation = item.value;
				reservation.carDetails = connectedDevices.getConnectedDevice(reservation.carId);
				if(!reservation.carDetails){
					//in case that the device is inactive, the carDetails can be null.
					//for the workaround, create a dummy device object to feed deviceID
					reservation.carDetails = {deviceID: reservation.carId};
				}
				return dbClient.getDeviceDetails(reservation.carDetails).then(function(device){
					reservation.carDetails = device;
					return reservation;
				})['catch'](function(err){
					return reservation; // resolve as `reservation` in case of error as well
				});
			});
			return Q.all(reservations);
		});
}

/*
 * Get an active reservation
 */
function getActiveUserReservation(reservationId, userid){
	var deferred = Q.defer();
	DB.get(reservationId ,null,function(err,reservation) {
		if(err){
			if(err.error == 'not_found')
				deferred.reject( {status: 404, message: "no such reservation " + _.escape(reservationId)} );
			else{//db error
				console.error(err);
				deferred.reject( {status: 500, message: err.message} );
			}
		}
		else if(reservation.userId !== userid)//reservation does not belong to current user
			deferred.reject( {status: 404, message: "no such reservation " + _.escape(reservationId) + " for current user"} );
		else if(reservation.status !== "active" && reservation.status !== "driving") //reservation not active
			deferred.reject( {status: 404, message: "no such active reservation " + _.escape(reservationId)} );
		else{
			reservation.carDetails = connectedDevices.getConnectedDevice(reservation.carId);
			if(!reservation.carDetails){
				reservation.carDetails = {deviceID: reservation.carId};
			}
			dbClient.getDeviceDetails(reservation.carDetails).then(function(device){
				reservation.carDetails = device;
				deferred.resolve(reservation);
			})['catch'](function(err){
				deferred.resolve(reservation);
			});
		}
	});
	return deferred.promise;
};

var weatherNotifications = {}; // reservationId -> timeout
var NOTIFY_WEATHER_ALERT_BEFORE = 60*60; // 1 hour before
var DEMO_MODE = true;
function setWeatherNotification(reservation){
	cancelWeatherNotification(reservation);

	var dropOffLocation = reservation.dropOffLocation;
	var dropOffTime = parseInt(reservation.dropOffTime);
	var now = parseInt((new Date()).getTime()/1000);
	var delay = (dropOffTime - now > NOTIFY_WEATHER_ALERT_BEFORE) && !DEMO_MODE ? (dropOffTime - now - NOTIFY_WEATHER_ALERT_BEFORE)*1000 : 5000;
	var timeout = setTimeout(function(){
		// check if the reservation is active
		getActiveUserReservation(reservation.reservationId || reservation._id, reservation.userId).then(
			function(reservation){
				var queryParam = {
					latitude: dropOffLocation.lat,
					longitude: dropOffLocation.lng,
					stimeInSec: dropOffTime - 60*60,
					etimeInSec: dropOffTime
				};
				Q.when(weatherInsights.getForecastsInRange(queryParam), function(weatherResult){
					debug("weatherResult: " + JSON.stringify(weatherResult));
					if(weatherResult.length > 0){
						if(weatherResult[0].qpf > THRESHOLD_TO_NOTIFY_RAIN || weatherResult[0].snow_qpf > THRESHOLD_TO_NOTIFY_SNOW){
							var userVcapSvc = JSON.parse(process.env.USER_PROVIDED_VCAP_SERVICES || '{}');
							var mca = userVcapSvc.AdvancedMobileAccess || VCAP_SERVICES.AdvancedMobileAccess;
							var mcaTenantId = (mca && mca.length > 0 && mca[0].credentials && mca[0].credentials.tenantId) || "";
							notificationUtils.sendMessage(
									weatherResult[0].phrase_32char + " is expected at drop-off time. You might want to drop-off the car 20 minutes earlier than reservation to avoid " + weatherResult[0].phrase_32char + ".",
									notificationUtils.CATEGORY_OK,
									{
										"reservationId": reservation.reservationId || reservation._id,
										"type": "weather",
										"appRoute": appEnv.url,
										"pushAppGuid": notificationUtils.notificationConfig.appGuid,
										"pushClientSecret": notificationUtils.notificationConfig.clientSecret,
										"mcaTenantId": mcaTenantId
									},
									[reservation.deviceId]
							);
						}
					}
				});
			}
		)["catch"](function(err){
			debug(err + ": weather notification is not sent");
		}).done();
	}, delay);
	weatherNotifications[reservation.reservationId] = timeout;
}
function cancelWeatherNotification(reservation){
	var timeout = weatherNotifications[reservation.reservationId || reservation._id];
	if(timeout){
		clearTimeout(timeout);
	}
}

/*
 * ****************** Generic Utility Functions ***********************
 */

function Validator(){
	this.isNumeric = function(str){return !isNaN(str)};

	this.escapeName = function(str){return str && str.replace(/[^0-9a-zA-Z\s_-]/g, "_");};
	this.escapeId = function(str){return str && str.replace(/^[^0-9a-zA-Z]+/, "").replace(/[^0-9a-zA-Z_-]/g, "_");};
}
