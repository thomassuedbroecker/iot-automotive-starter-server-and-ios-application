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
 * Simulation Engine - Virtual Car
 * - a simulated car managed by devicesManager
 */
module.exports = virtualCar;
var _ = require("underscore");
const nodeUtils = require('util');
var virtualDevice = require('./virtualDevice.js');
var chance = require('chance')();
var contextMapping = require('../driverInsights/contextMapping.js');


function virtualCar(deviceModel, deviceInstance, connect){
	// Initialize necessary properties from `virtualDevice` in this instance
	virtualDevice.call(this, deviceModel, deviceInstance, connect);
	
	// override
	this.onRunningCode = virtualCar.prototype.onRunningCode;
	this.onMessageReceptionCode = virtualCar.prototype.onMessageReceptionCode;
	
	//
	this._resetTrip();
};

//Inherit functions from `virtualDevice`'s prototype
nodeUtils.inherits(virtualCar, virtualDevice);

/*
* Called while driving state
*/
virtualCar.prototype.onRunningCode = function(){
	if(this.status=="Unlocked" && this.tripRoute.length > 0){
		if(this.tripReverse){
			this.tripRouteIndex--;
			if(this.tripRouteIndex < 0){
				// roundtrip completed 
				this._resetTrip();
				return;
			}
		}else{
			this.tripRouteIndex++;
			if(this.tripRouteIndex > this.tripRoute.length-1){
				this.tripRouteIndex = this.tripRoute.length-1;
				this.tripReverse = true;
			}
		}
		var loc = this.tripRoute[this.tripRouteIndex];
		var speed = getDistance(loc, this)*0.001*3600;
		while((speed - this.speed) < -20 && 
					(!!this.tripReverse || this.tripRouteIndex < this.tripRoute.length-1) && // this.tripReverse => index < length-1
					(!this.tripReverse || this.tripRouteIndex > 0)){ // !this.tripReverse => index > 0
			// too harsh brake, then skip the pointpoint
			this.tripRouteIndex += (this.tripReverse ? -1 : 1);
			loc = this.tripRoute[this.tripRouteIndex];
			speed = getDistance(loc, this)*0.001*3600;
		}
		while(speed>120 || (speed - this.speed) > 20){
			// too harsh acceleration, then insert intermediate point
			var loc2 = {lat: (+loc.lat+this.lat)/2, lon: (+loc.lon+this.lng)/2};
			speed = getDistance(loc2, this)*0.001*3600;
			this.tripRoute.splice(this.tripRouteIndex, 0, loc2);
			loc = loc2;
		}
		var rad = 90 - Math.atan2(Math.cos(this.lat/90)*Math.tan(loc.lat/90)-Math.sin(this.lat/90)*Math.cos((loc.lon-this.lng)/180),
				Math.sin((loc.lon-this.lng)/180)) / Math.PI * 180;
		rad = (rad + 360)%360;
		this.speed = speed;
		// Prepare matched_* to avoid calling map matching in probe.js 
		this.matched_heading = rad;
		this.matched_latitude = this.lat = loc.lat;
		this.matched_longitude = this.lng = loc.lon;
		this.link_id = loc.link_id;
	}
};

/*
* Called when state is changed.
* args: {message: commandName, payload: payload, topic: topic}
*/
virtualCar.prototype.onMessageReceptionCode = function(args){
	var message = args.message;
	if(message == "lock"){
		this.status = "Locked";
		this.trip_id = undefined;
	}else if(message == "unlock"){
		this.status = "Unlocked";
		// recalculate trip
		this._calculateTripRoute();
		// Use this trip for analyze
		// if trip_id is null, then will not call sendProbe in probe.js
		if(virtualCar.simulationImporter){
			virtualCar.simulationImporter.searchSimulatedTripsAround(this.lat, this.lng)
			.then(function(trips){
				if(trips.length > 0 && trips[0].distance < 75)
					return trips[0];
				return null;
			})['catch'](function(er){
				return null; // fallback
			})
			.then((function(trip){
				if(trip){ //use the simulation importer's trip
					this.trip_id = undefined;
					console.log("Simulation car(" + this.deviceID + ") trip_id has NOT assigned as a pre-simulated trip [" + trip.trip_id + "] exists.");
				}else{
					this.trip_id = chance.guid();
					console.log("Simulation car(" + this.deviceID + ") trip_id assigned: " + this.trip_id);
				}
			}).bind(this)).done();
		}else{
			this.trip_id = chance.guid();
			console.log("Simulation car(" + this.deviceID + ") trip_id assigned: " + this.trip_id);
		}
	}
};

/*
* Internal method to calculate simulated trip.
*/
virtualCar.prototype._calculateTripRoute = function(maxRetryCount){
	maxRetryCount = isNaN(maxRetryCount) ? 5 : maxRetryCount; // initialize retry count
	
	this._resetTrip();
	// select random location in about 10km from the current location
	var ddist = (Math.random()/2 + 0.5) * 0.15 / 2;
	var dtheta = 2 * Math.PI * Math.random();
	var dlat = +this.lat + ddist * Math.sin(dtheta);
	var dlng = +this.lng + ddist * Math.cos(dtheta);
	console.log("Simulation car(" + this.deviceID + ") trips to latitude=" + dlat + ", longitude=" + dlng + ", distance=" + getDistance(this,{lat:dlat, lng:dlng}));
	// calculate route
	var _this = this;
	
	contextMapping.routeSearch(this.lat, this.lng, dlat, dlng).then(function(route){
		if(route.state !== 'ROUTE_FOUND')
			return {retry: true};
		
		var routeArray = [];
		route.link_shapes.forEach(function(shapes){
			shapes.shape.forEach(function(shape){
				if(shape)
					routeArray.push(shape);
			});
		});
		_this.tripRoute = routeArray;
		_this.tripRouteIndex = 0;
		return {done: true}; // fulfilled
	})["catch"](function(er){
		// error on route search
		return {error: true}; // neither retry nor done
	}).then(function(result){
		if(result.done)
			return;
		if(result.retry && maxRetryCount > 0)
			return _this._calculateTripRoute(maxRetryCount - 1);
		
		// create a direct route instead
		console.error('Failed to find route. Creating a direct route... The cause is: ', result);
		var routeArray = [{lat: +_this.lat, lon: +_this.lng, link_id: -1 },
		                  {lat: +_this.lat, lon: +_this.lng, link_id: -1 },
		                  {lat: dlat, lon: dlng, link_id: -1 },
		                  {lat: dlat, lon: dlng, link_id: -1 }];
		_this.tripRoute = routeArray;
		_this.tripRouteIndex = 0;
	}).done();
};

virtualCar.prototype._resetTrip = function(){
	this.tripRoute = [];
	this.tripRouteIndex = 0;
	this.tripReverse = false;		
}
/**
 * Calculate distance in meters between two points on the globe
 * - p0, p1: points in {latitude: [lat in degree], longitude: [lng in degree]}
 */
function getDistance(p0, p1) {
	// Convert to Rad
	function to_rad(v) {
		return v * Math.PI / 180;
	}
	var latrad0 = to_rad(p0.lat);
	var lngrad0 = to_rad(p0.lng||p0.lon);
	var latrad1 = to_rad(p1.lat);
	var lngrad1 = to_rad(p1.lng||p1.lon);
	var norm_dist = Math.acos(Math.sin(latrad0) * Math.sin(latrad1) + Math.cos(latrad0) * Math.cos(latrad1) * Math.cos(lngrad1 - lngrad0));
	
	// Earths radius in meters via WGS 84 model.
	var earth = 6378137;
	return earth * norm_dist;
};
