/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */

/** Implementation Information for the folder driverInsights
*   ========================================================
*
*  Driver Profile handles a request to access a driver's behavior by using Driver Behavior service.
*  The routes/user/insights.js component defines the end point and the driverInsights/analyze.js component contains the implementation.
*
*  Driving Analysis gets events containing probe data from registered cars through Watson IoT Platform.
*  It then sends the probe data to the Context Mapping service to get the corrected location and sends
*  the corrected location to the Driver Behavior service to get the driver's behavior.
*  The driverInsights/probe.js component is the entry point to explore the implementation.
*  It also stores the probe data to Cloudant database "trip_route" that is used to retrieve a trip route.
*  For more information, see the driverInsights/tripRoutes.js component.
*
*/

var _ = require("underscore");
var Q = new require('q');
var request = require("request");
var cfenv = require("cfenv");
var fs = require("fs-extra");
var moment = require("moment");
var IOTF = require('../watsonIoT');
var contextMapping = require('./contextMapping.js');
var driverInsightsTripRoutes = require("./tripRoutes.js");
var debug = require('debug')('probe');
debug.log = console.log.bind(console);

var tripRouteCache = {};
var insertTripRouteTimer = null;
IOTF.on("+", function(payload, deviceType, deviceId){
	// check mandatory field
	if(!payload || !payload.trip_id || payload.trip_id.length === 0) return;
	if(!(payload.matched_longitude &&
			payload.matched_latitude &&
			payload.matched_heading &&
			(payload.matched_link_id || payload.link_id) &&
			payload.speed)){
		// need map matching
		if(isNaN(payload.lng) || isNaN(payload.lat) || !payload.trip_id || isNaN(payload.speed)){
			return;
		}
		if(!payload.lng || !payload.lat){
			return;
		}
	}

	// assign ts if missing
	payload.ts = moment(payload.ts || Date.now()).valueOf();

	(driverInsightsProbe.mapMatch(deviceType, deviceId, payload).then(function(prob){
		driverInsightsProbe.sendProbeData([prob]);
		return prob;
	})['catch'](function(er){
		// in case of failure in map match, generate probe from payload for tripRoute
		var m = moment(payload.ts);
		var prob = {
				"timestamp": m.format(), // ISO8601
				"matched_longitude": payload.lng,
				"matched_latitude": payload.lat,
				"matched_heading": payload.matched_heading,
				"matched_link_id": payload.matched_link_id || payload.link_id,
				"speed": payload.speed || 0,
				"mo_id": deviceId,
				"trip_id": payload.trip_id,
				"map_matched": false
		};
		return prob;
	})).then(function(prob){
		var trip_id = payload.trip_id;
		var routeCache = tripRouteCache[trip_id];
		if(!routeCache){
			tripRouteCache[trip_id] = routeCache = {routes: [], deviceType: deviceType, deviceID: deviceId };
		}
		_.extend(payload, prob);
		routeCache.routes.push(payload);
		if(!insertTripRouteTimer){
			insertTripRouteTimer = setTimeout(function(){
				var tmp = Object.assign({}, tripRouteCache);
				tripRouteCache = {};
				driverInsightsTripRoutes.insertTripRoutes(tmp);
				insertTripRouteTimer = null;
			}, 5000);
		}
	}).done();
});


var driverInsightsProbe = {
	last_prob_ts: moment().valueOf(),

	driverInsightsConfig: function(){
		var userVcapSvc = JSON.parse(process.env.USER_PROVIDED_VCAP_SERVICES || '{}');
		var vcapSvc = userVcapSvc.driverinsights || VCAP_SERVICES.driverinsights;
		if (vcapSvc) {
			var dirverInsightsCreds = vcapSvc[0].credentials;
			return {
				baseURL: dirverInsightsCreds.api,
				tenant_id : dirverInsightsCreds.tenant_id,
				username : dirverInsightsCreds.username,
				password : dirverInsightsCreds.password
			};
		}
		throw new Exception("!!! no provided credentials for DriverInsights. using shared one !!!");
	}(),

	mapMatch: function(deviceType, deviceId, payload){
		var self = this;
		var getProbe = function(results){
			if (results.length == 0)
				return Q.reject(new Error('rejecting as no matched location.'));

			var matched = results[0];
			var m = moment(payload.ts);
			var prob = {
					"timestamp": m.format(), // ISO8601
					"matched_longitude": matched.matched_longitude,
					"matched_latitude": matched.matched_latitude,
					"matched_heading": matched.matched_heading,
					"matched_link_id": matched.matched_link_id || matched.link_id,
					"speed": payload.speed || 0,
					"mo_id": deviceId,
					"trip_id": payload.trip_id
				};
			if(!matched.road_type && prob.matched_link_id && deviceType !== 'ConnectedCarDevice'){ // TODO stop adding road_type for simulation cars
//			if(!matched.road_type && prob.matched_link_id){
				return contextMapping.getLinkInformation(prob.matched_link_id).then(function(linkInfo){
					if(linkInfo.properties && linkInfo.properties.type){
						prob.road_type = linkInfo.properties.type;
					}
					return prob;
				}, function(error){return prob;});
			}else{
				return prob;
			}
		}
		if(payload.matched_longitude &&
			payload.matched_latitude &&
			payload.matched_heading &&
			(payload.matched_link_id || payload.link_id) &&
			payload.speed){
			return Q(getProbe([payload]));
		}
		return contextMapping.matchMapRaw(payload.lat, payload.lng).then(getProbe);
	},

	/*
	 * @param carProbeData a JSON object like
	 * [
	 *   {"matched_heading":108.57187,"speed":0.0,"mo_id":"DBA-6RCBZ","timestamp":"2014-08-16T08:42:51.000Z","trip_id":"86d50022-45d5-490b-88aa-30b6d286938b","distance":74.62322105574874,"matched_longitude":139.72316636456333,"matched_link_id":3.9501022001E10,"matched_latitude":35.684916086373,"longitude":139.72317575,"latitude":35.68494402,"road_type":"5","heading":90.0},
	 *   {"matched_heading":108.57187,"speed":0.0,"mo_id":"DBA-6RCBZ","timestamp":"2014-08-16T08:42:52.000Z","trip_id":"86d50022-45d5-490b-88aa-30b6d286938b","distance":74.5273839512979,"matched_longitude":139.72316538560304,"matched_link_id":3.9501022001E10,"matched_latitude":35.68491641529447,"longitude":139.72317628,"latitude":35.68494884,"road_type":"5","heading":360.0}
	 *  ]
	 */
	sendProbeData: function(carProbeData, callback) {
		var self = this;
		var node = this.driverInsightsConfig;
		var api = "/datastore/carProbe";

		var options = {
				method: 'POST',
				url: node.baseURL+api+'?tenant_id='+node.tenant_id,
				headers: {
					'Content-Type':'application/json; charset=UTF-8'
				},
				rejectUnauthorized: false,
				auth: {
					user: node.username,
					pass: node.password,
					sendImmediately: true
				},
		};
		for (var index = 0, len = carProbeData.length; index < len; index++) {
			options.body = JSON.stringify(carProbeData[index]);
			options.headers["Content-Length"] = Buffer.byteLength(options.body);
			debug("sendProbeData:" + options.body);
			request(options, function(error, response, body){
				if (!error && response.statusCode === 200) {
					debug('sendProbData response: '+ body);
					self.last_prob_ts = moment().valueOf(); //TODO Need to care in the case that payload.ts is older than last_prob_ts
					if(callback) callback(body);
				} else {
					console.error("sendProbeData:" + options.body);
					console.error('sendProbeData error(' + (response ? response.statusCode : 'no response') + '): '+ error + ': ' + body);
					if(callback) callback("{ \"error(sendProbe)\": \"" + body + "\" }");
				}
			});
		}
	},

	getCarProbeDataListAsDate: function(callback) {
		var deferred = Q.defer();

		var node = this.driverInsightsConfig;
		var api = "/datastore/carProbe/dateList";
		var options = {
				method: 'GET',
				url: node.baseURL+api+'?tenant_id='+node.tenant_id,
				headers: {
//					'Content-Type':'application/json; charset=UTF-8',
				},
				rejectUnauthorized: false,
				auth: {
					user: node.username,
					pass: node.password,
					sendImmediately: true
				},
		};
		request(options, function(error, response, body){
			if (!error && response.statusCode === 200) {
				callback && callback(body);
				deferred.resolve(body);
			} else {
				console.error('error: '+ body );
				callback && callback("{ \"error(getCarProbeDataListAsDate)\": \"" + body + "\" }");
				deferred.reject(error||body);
			}
		});
		return deferred.promise;
	}
}

module.exports = driverInsightsProbe;

// Update last_prob_ts
driverInsightsProbe.getCarProbeDataListAsDate(function(body){
	try{
		var parsed = JSON.parse(body);
		var probeDateList = parsed && parsed.return_code === 0 && parsed.date;
		if(Array.isArray(probeDateList) && probeDateList.length > 0){
			driverInsightsProbe.last_prob_ts = probeDateList.map(function(probeDate){return moment(probeDate).valueOf();}).sort(function(a, b){return b - a;})[0];
		}
	}catch(ex){
		debug(ex);
		// Don't update last_prob_ts
	}
});
