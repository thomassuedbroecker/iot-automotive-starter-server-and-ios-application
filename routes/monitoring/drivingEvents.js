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
 *
 *
 * Debug: DEBUG=monitoring:drivingEvents
 */
var router = module.exports = require('express').Router();
var Q = require('q');
var _ = require('underscore');

var contextMapping = require('../../driverInsights/contextMapping.js')

var cloudantHelper = require('../../cloudantHelper.js');
var drivingDataSync = require('./drivingDataSync.js');

var debug = require('debug')('monitoring:drivingEvents');
debug.log = console.log.bind(console);

/**
 * Get all the driving events, which is devents from driver insights, registered to the context mapping service
 * 
 * GET /monitoring/drivingEvents/query?max_lat=[float]&max_lng=[float]&min_lat=[]&min_lng=[]
 * Result: 200 OK
 * { devices: [
 *   {"deviceID": "1234567890ab", "lat": 12.345, "lng": 34.567, "status": "[status]"},
 *   ...
 * ]}
 * where [status] in {'in_use', 'available', 'unavailable'}
 * 
	// search cars and the status in the area as follow
	// 1. get cars from DB (devices)
	// 2. for each cars from DB, test if it's in the devicsCache
	//   -> false to set the car state: `unavailable`
	//   -> true to look at the car's lock status
	//     -> "Locked" cars are categorized as status `in_use`
	//     -> "Unlocked" cars are categorized as `available` 
 * 
 * Examples:
 *  List all the cars
 *   http://localhost:6003/monitoring/drivingEvents/query?min_lat=-90&max_lat=90&min_lng=-180&max_lng=180
 */
router.get('/drivingEvents/query', function(req, res){
	var max_lat = parseFloat(req.query.max_lat),
		max_lng = parseFloat(req.query.max_lng),
		min_lat = parseFloat(req.query.min_lat),
		min_lng = parseFloat(req.query.min_lng);
	// normalize
	min_lng = min_lng % 360; if (min_lng > 180) min_lng = min_lng - 360;
	max_lng = max_lng % 360; if (max_lng > 180) max_lng = max_lng - 360;
	
	// test the query values
	if ([max_lat, max_lng, min_lat, min_lng].some(function(v){ return isNaN(v); })) {
		return res.status(400).send('One or more of the parameters are undefined or not a number'); // FIXME response code
	}
	
	contextMapping.queryEvent(min_lat, min_lng, max_lat, max_lng, DEIVER_BEHAVIOR_EVENT_TYPE)
	.then(function(response){
		res.send({n_events: response.length, events: response});
	})['catch'](function(err){
		console.error('error query context mapping events: ', err);
		res.status(500).send('Internal server error. See the server log.' + err);
	}).done();
});

/*
 * Synchronize the Driving Behaviors in the trip_uuids (null to all)
 * - This is registered to drivingDataSync.syncListener and called after finishing drivingData sync operation
 * - This reads driving behavior details from DB, and create events in Context Mapping service 
 */
var syncDrivingBehaviorsAndEvents = function(){
	// prepare base data
	var denseRegionsWithBehavior = drivingDataSync.getDenseRegionsWithBehavior();
	var getMapEvents = contextMapping.getAllEvents().then(function(events){
		return _.where(events, {event_type: DEIVER_BEHAVIOR_EVENT_TYPE});
	});
	
	var syncEventOp = Q.spread([denseRegionsWithBehavior, getMapEvents], 
			function(regionsWithBehavior, mapEvents){
		// create event map
		var newMapEvents = [];
		var mapEventsDic = _.indexBy(mapEvents, 'originator');
		
		regionsWithBehavior.forEach(function(rwb){
			debug('Processing a driver event... ', rwb);
			if(!rwb.behavior || !rwb.region)
				return;
			var eventDoc = getDrivingEventDoc(rwb.behavior);
			var existingMapEvent = mapEventsDic[eventDoc.originator];
			if(existingMapEvent){
				existingMapEvent.synced = true;
			}else{
				eventDoc.event_name = rwb.behavior.behavior_name + ': ' + rwb.region.value.trips.length + ' times.'
				newMapEvents.push(eventDoc);
			}
		});
		var deleteMapEventIds = _.pluck(mapEvents.filter(function(e){
			return !e.synced;
		}), 'event_id');
		
		debug('Creating %d events, deleting %d events...', newMapEvents.length, deleteMapEventIds.length);
		var createOps = Q.all(newMapEvents.map(contextMapping.createEvent));
		var deleteOps = Q.all(deleteMapEventIds.map(contextMapping.deleteEvent));
		return Q.spread([createOps, deleteOps], function(created, deleted){
			return {created: created, deleted: deleted};
		});
	});
	
	// promise
	return syncEventOp;
};

/*
 * The evnet type for our driving behavior details for context mapping
 */
var DEIVER_BEHAVIOR_EVENT_TYPE = 'iota-starter-driving-behavior';

/*
 * Create a Context Mapping event document from a Driver Behavior's driving_behavior_details object
 * @see https://developer.ibm.com/api/view/id-194:title-IBM__Watson_IoT_Context_Mapping#POST/eventservice/event
 */
var getDrivingEventDoc = function(drivingBehaviorDetail) {
	const detail = drivingBehaviorDetail; // alias
	
	var doc = {
		event_type: DEIVER_BEHAVIOR_EVENT_TYPE, // mandatory, queriable
		s_latitude: detail.start_latitude, // mandatory
		s_longitude: detail.start_longitude, // manodatory
		start_time: detail.start_time,
		end_time: detail.end_time,
		event_category: detail.behavior_name,	// name of the driving behavior
		event_name: detail.behavior_name,
		originator: detail._id, //drivingDataSync.getDrivingDetailKey(detail),	// "trip_[trip_id]_id"
		//timestamp: null,
		//status: null, // queriable
		//heading: null,
	};
	return doc;
};

/*
 * Register the event sync function to the base synchronizer
 */
drivingDataSync.syncListeners.push(syncDrivingBehaviorsAndEvents);

