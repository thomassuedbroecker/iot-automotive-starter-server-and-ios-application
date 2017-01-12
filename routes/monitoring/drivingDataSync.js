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
 * This module provides base services about Driver Behavior for monitoring
 * dashbaord. Especially between Driver Behavior service and a Cloudant
 * DB used for caching the service results.
 *
 * Debug: DEBUG=monitoring:drivingBase
 */
var router = module.exports = require('express').Router();
var Q = require('q');
var _ = require('underscore');

var driverInsightsAnalyze = require('../../driverInsights/analyze.js')
var cloudantHelper = require('../../cloudantHelper.js');

var debug = require('debug')('monitoring:drivingDataSync');
debug.log = console.log.bind(console);

/**
 * Sync listener registry
 * (Intended for other driving behavior-related routers to register their handlers)
 */
router.syncListeners = [];

/**
 * Sync timer
 */
router.syncTimerTimeout = 120 * 60 * 1000; // every 2 hours

/**
 * Synchronize the event info
 * 
 * GET /monitoring/driving/sync[?max_create=10]
 */
router.get('/driving/sync', function(req, res){
	var max_create = parseInt(req.query.max_create || 10);
	router.initSync().then(function(result){
		res.send(result);
	})['catch'](function(e){
		res.status(500).send(e);
	}).done();
});

/**
 * Synchronize the Driving Behavior caches
 * (This method is intended to be called from _app.js for the startup). 
 */
router.initSync = function(){
	// check is there is an operation in progress
	if(router._currentSyncOp && router._currentSyncOp.isPending()){
		debug('Rejecting syncing due to "sync is in progress."');
		var msg = {
			code: 409,
			message: 'Sync is in progress...',
			duration: (Date.now() - router._syncStartTime)
		};
		return Q.reject(msg);
	}
	// stop staled timer
	if(router._nextSyncTimer){
		clearTimeout(router._nextSyncTimer);
		router._nextSyncTimer = 0;
	}
	router._nextSyncTime = 0;
	// start sync
	router._syncStartTime = Date.now();
	router._currentSyncOp = syncDriverBehavior();
	router._currentSyncOp['finally'](function(){
		router._currentSyncOp = null;
		router._lastFinishedTime = Date.now();
		router._lastSyncDuration = Date.now() - router._syncStartTime;
		router._syncStartTime = undefined;
		// schedule next
		router._nextSyncTime = Date.now() + router.syncTimerTimeout;
		router._nextSyncTimer = setTimeout(function(){
			router.initSync();
		}, router.syncTimerTimeout);
	}).done();
	return router._currentSyncOp;
};

/**
 * Get sync status
 */
router.getSyncStatus = function(){
	var in_progress = (router._currentSyncOp && router._currentSyncOp.isPending()) ? true : false;
	var result = {
			msg: (in_progress ? 'Sync in progress...' : 'Waiting for next sync...'),
			in_progress: in_progress,
			duration: (router._syncStartTime && Date.now() - router._syncStartTime),
			lastSyncDuration: router._lastSyncDuration,
			lastSyncStartTime: router._syncStartTime && new Date(router._syncStartTime).toLocaleString(),
			lastFinishedTime: router._lastFinishedTime && new Date(router._lastFinishedTime).toLocaleString(),
			nextSyncTime: router._nextSyncTime && new Date(router._nextSyncTime).toLocaleString(),
	};
	return result;
}

/*
 * Sync main function
 */
var syncDriverBehavior = function(){
	debug('Starting initial event sync...');
	// get Trip UUIDs
	var trip_uuids = getTripUuids();
	// store all the driver behavior summaries to DB
	var syncBehaviors = syncDriverBehaviors(trip_uuids);
	// store the driver behavior scores with user_id and trip_id associated
	var syncScores = syncBehaviors.then(function(){ return syncUserScores(); });
	// store the driver behavior details to DB
	var syncEvents =  syncScores.then(function(){ return syncDrivingBehaviorDetails(trip_uuids); });
	
	return Q.all([syncBehaviors, syncEvents]).then(function(behavior, events){
		debug('Base sync finished: ', behavior, events);
		var deferredOps = [];
		router.syncListeners.forEach(function(listener){
			var r = listener.apply();
			if(r)
				deferredOps.push(r);
		});
		debug('Starting %d deferred sync listenres...', deferredOps.length);
		return Q.all(deferredOps);
	}).then(function(result){
		debug('Initial event sync finished: ', result);
	})['catch'](function(e){
		console.error(e);
	})['finally'](function(){
		router._currentSyncDrivingBehaviorAndEvents = null;
	});
};

/*
 * Sync sub - getTripIds
 */
var getTripUuids = function(trip_uuids){
	if(!trip_uuids){
		trip_uuids = driverInsightsAnalyze.getAnalyzedTripSummaryList()
			.then(function(trip_summary){
				// convert to a list of trip_ids
				return [].concat(trip_summary).map(function(ts){
					return ts.id.trip_uuid;
				});
			});
	} else {
		trip_uuids = Q(trip_uuids);
	}
	return trip_uuids;
};

/*
 * Sync helper - getZone
 */
var getZoneAtSync = function(zones, lat, lng){
	if(!zones){
		 zones = [
		             {id: 'tokyo'  ,name: 'Tokyo, Japan', extent:  [139.03856214008624,35.53126066670448,140.16740735493002,35.81016922341598]},
		             {id: 'vegas'  ,name: 'Las Vegas', extent: [-116.26637642089848,35.86905016413695,-114.00868599121098,36.423521308323046]},
		             {id: "munich" ,name: 'Munich, Germany', extent: [10.982384418945298,48.01255711693946,12.111229633789048,48.24171763772631]},
		             {id: "toronto",name: 'Toronto, Canada', extent: [-80.69297429492181,43.57305259767264,-78.43528386523431,44.06846938917488]},
		             ];
	}
	// normalize lng
	if(lng<-180 || 180<=lng) lng = ((lng + 180) % 360) - 180;
	var r = _.find(zones, function(zone){
		return (zone.extent[0] <= lng && lng <= zone.extent[2]) &&
				(zone.extent[1] <= lat && lat <= zone.extent[3]);
	});
	return r || {id: '~other', name: 'Other zone'};
};

/*
 * Sync sub - syncUserScores
 * - Store tuple of (userId, trip_id, scoring (from trip_uuid), start_latitude, start_longitude) to DB
 *   - to get driving score easily
 * - Create if missing, update if exists
 * - Deleting DB documents is not implemented yet
 */
var syncUserScores = function(){
	// create map from trip_id to scoring
	var tripIdToScore = getAllBehaviors().then(function(behaviors){
		var tripIdToScore = {};
		behaviors.forEach(function(b){ tripIdToScore[b.trip_id] = b.scoring; });
		return tripIdToScore;
	});
	var allScoreDocs = getAllScoreDocs();
	
	return Q.spread([tripIdToScore, allScoreDocs, cloudantHelper.searchView('closedReservations', {})], 
			function(tripIdToScore, targetDocs, result){
		targetDocs = targetDocs || [];
		var srcRows = result.rows || [];
		debug('Syncing: # of closed reservations: ', srcRows.length / 2); // note that each reservation generates two rows in the view
		debug('Syncing: # of existing trip scores: ', targetDocs.length);
		var targetDocMap = _.indexBy(targetDocs, '_id');
		
		// create new target docs
		var counters = {update: 0, create: 0, remove: 0};
		var docs = srcRows.map(function(row){
			if(!row.value._id || !row.value.trip_id) return;
			// create a new doc
			var doc = {
					type: USER_SCORING_DOC_TYPE,
					_id: ('score_' + row.value._id), // reservation id
					userId: row.value.userId,
					trip_id: row.value.trip_id,
					scoring: tripIdToScore[row.value.trip_id],
					start_latitude: (row.value.pickupLocation && row.value.pickupLocation.lat),
					start_longitude: (row.value.pickupLocation && row.value.pickupLocation.lng),
			};
			// decorate with zone
			var zone = getZoneAtSync(null, doc.start_latitude, doc.start_longitude);
			doc.zone_id = zone && zone.id;
			doc.zone_name = zone && zone.name;
			// update with existing -- assign _rev for update
			var targetDoc = targetDocMap[doc._id];
			if(targetDoc){
				doc._rev = targetDoc._rev; // for update
				targetDoc.syncStatus = true;
				counters.update ++;
			}else{
				counters.create ++;
			}
			return doc;
		}).filter(function(doc){ return !!doc; });
		
		// append docs for deletion
		var targetDocsToDelete = _.filter(targetDocs, function(r){ return !r.syncStatus; });
		debug('  creating %d, updating %d, deleting %d trip score documents...', counters.create, counters.update, targetDocsToDelete.length);
		docs.concat(targetDocsToDelete.map(function(r){
			return {_id: r._id, _rev: r._rev, _deleted: true };
		}));		
		// sync target docs
		return db.bulk({docs: docs}).then(function(result){
			// dump error to console if any
			if(result){
				result.filter(function(item){ return item.error; }).map(function(item){
					console.error('  error on updating trip score documents: _id=' + item.id + ': ' + item.error);
				});
			}
		});
	});
};

/*
 * Sync sub - syncDriverBehaviors
 * - Store driver behavior summary document to DB
 */
var syncDriverBehaviors = function(trip_uuids){
	var trip_uuids = getTripUuids(trip_uuids); // expand if necessary
	var existing_behaviors = getAllBehaviors(); // get existing
	
	var syncOps = Q.spread([trip_uuids, existing_behaviors], function(trip_uuids, existing_records){
		trip_uuids = trip_uuids || [];
		existing_records = existing_records || [];
		debug('Syncing: # of trip_uuids: ', trip_uuids.length);
		debug('Syncing: # of existing records: ', existing_records.length);
		var recordsMap = _.indexBy(existing_records, '_id');
		var counters = {create: 0, update: 0};
		return Q.all(trip_uuids.map(driverInsightsAnalyze.getBehavior)).then(function(behaviors){
			var allDocs = behaviors.map(function(behavior){
				var doc = behavior;
				doc.type = DRIVING_BEHAVIOR_DOC_TYPE;
				// decorate with zone
				var zone = getZoneAtSync(null, doc.start_latitude, doc.start_longitude);
				doc.zone_id = zone && zone.id;
				doc.zone_name = zone && zone.name;
				// update with existing
				var existingDoc = recordsMap[getDrivingBehaviorKey(doc)];
				if(existingDoc){
					doc._rev = existingDoc._rev; // for update
					existingDoc.syncStatus = true;
					counters.update ++;
				}else{
					counters.create ++;
				}
				return doc;
			});
			// append docs for deletion
			var delete_records = _.filter(existing_records, function(r){ return !r.syncStatus; });
			debug('  creating %d, updating %d, and deleting %d driver behavior documents...', counters.create, counters.update, delete_records.length);
			allDocs.concat(delete_records.map(function(r){
				return {_id: r._id, _rev: r._rev, _deleted: true };
			}));
			return createBehaviors(allDocs).then(function(result){
				// dump error to console if any
				if(result){
					result.filter(function(item){ return item.error; }).map(function(item){
						console.error('  error on updating driving behavior documents: _id=' + item.id + ': ' + item.error);
					});
				}
			});;
		});
	});
	return syncOps;
};

/*
 * Sync sub - syncDrivingBehaviorDetails
 * - Store driver behavior details as documents to DB
 */
var syncDrivingBehaviorDetails = function(trip_uuids, optionalMaxCreationCount){
	var trip_uuids = getTripUuids(trip_uuids); // expand if necessary
	var existing_details = getAllDetails(); // get existing
	
	// 3. compare and get operations to sync
	var syncOps = Q.spread([trip_uuids, existing_details], function(trip_uuids, existing_details){
		trip_uuids = trip_uuids || [];
		existing_details = existing_details || [];
		debug('Syncing: # of trip_uuids: ', trip_uuids.length);
		debug('Syncing: # of details: ', existing_details.length);
		// build details map
		var detailsMap = _.indexBy(existing_details, '_id');
		// assign "syncStatus='synced'" to event and create a list of new details 
		var newDetails = []; // the details that need to be created
		var syncDetailStatus = trip_uuids.map(function(trip_uuid){
			// for a single trip_uuid's trip details, update the existing_events (eventsMap)
			return driverInsightsAnalyze.getAnalyzedTripInfo(trip_uuid)
				.then(function(tripDetails){
					// test tripDetails and 
					var details = tripDetails.ctx_sub_trips.reduce(function(d, sub_trip){
						return d.concat(sub_trip.driving_behavior_details);
					}, []);
					// mark existing event or store to new
					details.forEach(function(detail){
						var key = getDrivingDetailKey(detail);
						var existingDetail = detailsMap[key];
						if (existingDetail){
							existingDetail.syncStatus = 'synced';
							detail._rev = existingDetail._rev; // for updating document
							newDetails.push(detail);
						} else {
							newDetails.push(detail);
						}
					});
				});
		});
		// create / delete events after all the existing_events are synced
		return Q.all(syncDetailStatus).then(function(){
			var createDetailOps = createDetails(newDetails);
			var deleteIds = existing_details.filter(function(d){
				return d.syncStatus !== 'synced';
			}).map(function(d){
				return d._id;
			});
			var deleteDetailOps = deleteDetails(deleteIds);
			debug('  syncing driving behavior detail db: creating/updating %d docs...', newDetails.length);
			debug('  syncing driving behavior detail db: deleting %d docs...', deleteIds.length);
			return Q.spread([createDetailOps, deleteDetailOps], function(created, deleted){
				return { created: created, deleted: deleted };
			});
		});
	});	
	return syncOps;
};

/**
 * Get areas of high density
 */
router.getDenseRegionsWithBehavior = function(){
	// 4. get driving events of high density
	var getDenseRegions = Q().then(function(){
		var topRegions = db.view(null, 'density', {group: true, group_level: 2})
		.then(function(topresult){
			var topRegions = topresult.rows.filter(function(row){
				// filter by there are multiple trip_id for a zone
				return row.value && row.value.trips && row.value.trips.length >=2;
			});
			return topRegions;
		});
		var subRegions = function(subRegions){
			return Q.all(subRegions.map(function(row){
				// deeper search
				debug('Searching events in region: ', [row.key[0], row.key[1], 0, 0, null])
				var v = db.view(null, 'density', {
					startkey: [row.key[0], row.key[1], 0, 0, null], 
					endkey: [row.key[0], row.key[1]+1, 0, 0, null], 
//					inclusive_end: false, stale: true,
//					reduce: true,
					group: true, group_level: 5, 
					});
				return v.then(function(result){
						var r = (result.rows || []).filter(function(row){
							return row.value && row.value.trips && row.value.trips.length >=2; // need two or more trips in a region
						});
						debug('  regions found: ', _.pluck(r, 'key'));
						return r;
					});
			}));
		};
		return topRegions.then(subRegions);
	});
	
	//5. expand driver events region with one of driver event instance
	var getRegionsWithBehavior = getDenseRegions.then(function(denseRegions){
		return Q.all(denseRegions.map(function(regions){
			var keys = regions.map(function(r){ return r.value.id; });
			debug('Fetching docs: ', keys)
			if(keys.length === 0) return [];
			return db.fetch({keys: keys})
			.then(function(behaviorDocs){
				var docMap = _.indexBy(_.pluck(behaviorDocs.rows || [], 'doc'), '_id');
				return regions.map(function(region){
					return {
						region: region,
						behavior: docMap[region.value.id],
					};
				});
			});
		}));
	}).then(function(resultss){
		var events = _.flatten(resultss);
		debug('Retrieved all the events', events);
		return events;
	});
	return getRegionsWithBehavior;
};

/*
 * The DB document types for our driving behavior
 */
var USER_SCORING_DOC_TYPE = 'user_scoring'
var DRIVING_BEHAVIOR_DOC_TYPE = 'driving_behavior';
var DRIVING_DETAIL_DOC_TYPE = 'driving_detail';

/*
 * Get event source info, which is used to sync events and driving insight details
 */
var getDrivingBehaviorKey = function(behavior){
	return 'behavior_' + behavior.trip_uuid;
};

/*
 * Get event source info, which is used to sync events and driving insight details
 */
var getDrivingDetailKey = function(detail){
	return 'detail_' + detail.sub_trip_id + '_' + detail.id;
};

//
//THE FOLLOWING SECTION IS FOR DRIVING BEHAVIOR DETAILS CLOUDANT DATABASE
//

var getAllScoreDocs = function(){
	return db.find({selector:{type: USER_SCORING_DOC_TYPE}, fields: ['_id', '_rev']}).then(function(result){
		return result.docs || [];
	});
};

var createBehaviors = function(docs){
	if(!docs || docs.length == 0) return Q([]);
	// assign type to doc
	docs = docs.map(function(doc){
		return _.extend(_.clone(doc), {
			type: DRIVING_BEHAVIOR_DOC_TYPE,
			_id: doc._id || getDrivingBehaviorKey(doc) });
	});
	// insert docs
	return db.bulk({docs: docs});
};

var getAllBehaviors = function(){
	return db.find({selector:{type: DRIVING_BEHAVIOR_DOC_TYPE}, fields: ['_id', '_rev', 'trip_id', 'scoring']}).then(function(result){
		return result.docs || [];
	});
};


var createDetails = function(docs){
	if(!docs || docs.length == 0) return Q([]);
	// assign type to doc
	docs = docs.map(function(doc){
		return _.extend(_.clone(doc), {
			type: DRIVING_DETAIL_DOC_TYPE,
			_id: docs._id || getDrivingDetailKey(doc) });
	});
	// insert docs
	return db.bulk({docs: docs});
};

var deleteDetails = function(detail_ids){
	if(!detail_ids || detail_ids.length == 0) return Q([]);
	// delete events stored in the cloudant db
	return db.fetch({keys: detail_ids})
		.then(function(result){
			var bulkDocs = _.map(result.rows, function(row){
				var doc = row.doc;
				return {_id: doc._id, _rev: doc._rev, _deleted: true};
			});
			return db.bulk({docs: bulkDocs});
		});
};

//queryEvent(min_lat, min_lng, max_lat, max_lng, DEIVER_BEHAVIOR_EVENT_TYPE)
var queryDetail = function(min_lat, min_lng, max_lat, max_lng){
	var qs = ('lat:[' + min_lat + ' TO ' + max_lat + '] AND ' +
			'lng:[' + min_lng + ' TO ' + max_lng + ']'); 
	return db.search(null, 'location', {q:qs}).then(function(result){
		return result.rows || [];// row.id, row.fields.lat, row.fields.lng
	});
};

var getAllDetails = function(){
	return db.find({selector:{type: DRIVING_DETAIL_DOC_TYPE}, fields: ['_id', '_rev']}).then(function(result){
		return result.docs || [];
	});
};

/*
 * The Cloudant DB to store the event details
 */
var CLOUDANT_DB_NAME = 'monitoring_drive_facts';
var db; // initialized at the bottom of the js file

var designDoc = {
		_id: '_design/' + CLOUDANT_DB_NAME,
		views: {
			users: {
				map: (function(doc){
					if(doc.type === 'user_scoring'){
						emit(doc.userId, doc._id);
					}
				}).toString(),
				reduce: '_count',
			},
			scoreByUser: {
				map: (function(doc){
					if(doc.type === 'user_scoring' && doc.scoring){
						emit(doc.userId, doc.scoring.score);
					}
				}).toString(),
				reduce: (function(key, values, rereduce){
					return values.length > 0 ? sum(values) / values.length : 0;
				}),
			},
			scoreByZone: {
				map: (function(doc){
					if(doc.type === 'user_scoring' && doc.scoring){
						emit([doc.zone_id, doc.zone_name], doc.scoring.score);
					}
				}).toString(),
				reduce: '_stats'
			},
			behaviorScoreByZone: {
				map: (function(doc){
					if(doc.type === 'driving_behavior' && doc.scoring){
						emit([doc.zone_id, doc.zone_name], doc.scoring.score);
					}
				}).toString(),
				reduce: '_stats'
			},
			scoreByLocation: {
				map: (function(doc){
					if(doc.type === 'user_scoring' && doc.scoring){
						emit([doc.start_longitude, doc.start_latitude], doc.scoring.score);
					}
				}).toString(),
				reduce: (function(key, values, rereduce){
					return values.length > 0 ? sum(values) / values.length : 0;
				}),
			},
			density: {
				map: (function(doc){
					if(doc.type === 'driving_detail'){
						var xx = Math.floor(doc.start_longitude*10); // about 100m mesh
						var yy = Math.floor(doc.start_latitude*10);
						var x = Math.floor(doc.start_longitude*1000); // about 100m mesh
						var y = Math.floor(doc.start_latitude*1000);
						emit([yy,xx,y,x,doc.behavior_name], {id:doc._id, trip:doc.trip_id});
						var x = Math.floor(doc.end_longitude*1000); // about 100m mesh
						var y = Math.floor(doc.end_latitude*1000);
						emit([yy,xx,y,x,doc.behavior_name], {id:doc._id, trip:doc.trip_id});
					}
				}).toString(),
				reduce: (function(key, values, rereduce){
					if(rereduce){
						var r = [], id = null;
						for(var i=0;i<values.length;i++){
							for(var j=0;j<values[i].trips.length;j++){
								if(r.indexOf(values[i].trips[j]) == -1)
									r.push(values[i].trips[j]);
							}
							if(!id || id < values[i].id)
								id = values[i].id;
						}
						return {id: id, trips: r};
					}
					var r = [], id = null;
					for(var j=0;j<values.length;j++){
						if(r.indexOf(values[j].trip) == -1)
							r.push(values[j].trip);
						if(!id || id < values[j].id)
							id = values[j].id;
					}
					return {id: id, trips: r};
				}).toString(),
			}
		},
		indexes: {
			location: {
				index: (function(doc){
					if(doc.type === 'driving_detail'){
						index('lat', doc.start_latitude, {"store": true});
						index('lng', doc.start_longitude, {"store": true});
					}
				}).toString(),
			},
			score: {
				index: (function(doc){
					if(doc.type === 'user_scoring'){
						index('userId', doc.userId, {"store": true});
						index('trip_id', doc.trip_id, {"store": true});
						index('lat', doc.start_latitude, {"store": true});
						index('lng', doc.start_longitude, {"store": true});
						index('score', doc.scoring.score, {"store": true, "facet": true});
					}
				}).toString(),
			},
		},
		st_indexes: {
			geoindex: {
				index: (function(doc){
					if(doc.type === 'driving_detail'){
						var geometry = {
								type: "Point",
								coordinates: [doc.start_longitude, doc.start_latitude]
							};
						st_index(geometry);
					}
				}).toString(),
			}
		}
};

//init DB and start timer session
(function(){
	var indexes = [{name: 'type', type: 'json', index:{fields:['type']}}];
	router.db = db = cloudantHelper.getDeferredDB(CLOUDANT_DB_NAME, designDoc, indexes);
}());


