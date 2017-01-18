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
 
var tripRoutes = module.exports;

var _ = require("underscore");
var Q = require("q");
var debug = require('debug')('tripRoutes');
debug.log = console.log.bind(console);
var dbClient = require('./../cloudantHelper.js');
var driverInsightsAnalyze = require('../driverInsights/analyze');
var moment = require('moment');

var TRIPROUTES_DB_NAME = "trip_routes";
var JOB_STATUS_PREFIX = "job_status_";

_.extend(tripRoutes, {
	db: null,

	_init: function(){
		/*
		 * Database "trip_routes" stores route array for each trip_id
		 * document = {routes: {lat: "-90 ~ 90", lng: "-180 ~ 180", ts: "timestamp in mill", id: "device id", trip_id: "uuid", ...}
		 */
		this.db = dbClient.getDB(TRIPROUTES_DB_NAME, this._getDesignDoc());
	},

	getTripInfo: function(trip_id){
		var deferred = Q.defer();
		Q.when(this.db, function(db){
			db.get(trip_id, function(err, body){
				if(err){
					deferred.reject(err);
				}else{
					if(body.routes && body.routes.length > 0){
						var numRoutes = body.routes.length;
						var route0 = body.routes[0];
						var routeZ = body.routes[numRoutes-1];
						deferred.resolve({
							trip_id: trip_id,
							start_latitude: route0.lat-0,
							start_longitude: route0.lng-0,
							end_latitude: routeZ.lat-0,
							end_longitude: routeZ.lng-0,
							start_time: moment(route0.ts).valueOf(),
							end_time: moment(routeZ.ts).valueOf()
						});
					}else{
						deferred.reject("no routes");
					}
				}
			})["catch"](function(error){
				deffered.reject(error);
			});
		});
		return deferred.promise;
	},

	getTripLocation: function(trip_id){
		var deferred = Q.defer();
		Q.when(this.db, function(db){
			db.get(trip_id, function(err, body){
				if(err){
					deferred.reject(err);
				}else{
					if(body.routes && body.routes.length > 0){
						deferred.resolve({trip_id: trip_id, lat: body.routes[0].lat, lng: body.routes[0].lng});
					}else{
						deferred.reject("no routes");
					}
				}
			})["catch"](function(error){
				deffered.reject(error);
			});
		});
		return deferred.promise;
	},
	insertTripRoutes: function(tripRoutes){
		debug("insert trip routes");
		var self = this;
		Q.when(this.db, function(db){
			var tripIds = Object.keys(tripRoutes);
			db.fetch({keys: tripIds}, function(err, body){
				var existingRoutes = (body && body.rows) || [];
				var tripDocs = tripIds.map(function(trip_id, index){
					var tripRoute = tripRoutes[trip_id];
					var appendingRoutes = tripRoute.routes;
					// The rows must be returned in the same order as the supplied "keys" array.
					var doc = (!existingRoutes[index] || existingRoutes[index].key !== trip_id || existingRoutes[index].error === "not_found")
								? {_id: trip_id, routes: []}
								: existingRoutes[index].doc;
					doc.routes = doc.routes.concat(appendingRoutes).sort(function(a, b){
						return a.ts - b.ts;
					});
					// update the device info if necessary
					if(tripRoute.deviceID) doc.deviceID = tripRoute.deviceID;
					if(tripRoute.deviceType) doc.deviceType = tripRoute.deviceType;
					return doc;
				});
				db.bulk({docs: tripDocs}, "insert", function(err, body){
					if(err){
						console.error("inserting trip routes failed");
					}else{
						debug("inserting trip routes succeeded");
					}
				});
			})["catch"](function(error){
				console.error(error);
			});
		});
	},

	getTripRouteRaw: function(trip_id){
		var deferred = Q.defer();
		var self = this;
		Q.when(self.db, function(db){
			db.get(trip_id, function(err, body){
				if(err){
					console.error(err);
					deferred.reject(err);
					return;
				}
				deferred.resolve(body)
			});
		})["catch"](function(error){
			console.error(error);
			deferred.reject(error);
		});
		return deferred.promise;
	},
	getTripRouteById: function(trip_id, options){
		var count = (options && options.count) || -1;
		var matchedOnly = options && options.matchedOnly === "true";
		var deferred = Q.defer();
		var self = this;
		Q.when(self.db, function(db){
			db.get(trip_id, function(err, body){
				if(err){
					console.error(err);
					deferred.reject(err);
					return;
				}
				var coordinates = count > 0 && count < body.routes.length ? body.routes.slice(-count) : body.routes;
				if(matchedOnly){
					coordinates = coordinates.filter(function(payload){
						return !payload.map_matched;
					});
				};
				coordinates = coordinates.map(function(payload){
					var lng = payload.matched_longitude || payload.lng || payload.longitude;
					var lat = payload.matched_latitude || payload.lat || payload.latitude;
					return [lng, lat];
				});
				var geoJson = {
						type: "FeatureCollection",
						features: [{type: "Feature", geometry: {type: "LineString", coordinates: coordinates}}]
				};
				deferred.resolve(geoJson);
			});
		})["catch"](function(error){
			console.error(error);
			deferred.reject(error);
		});
		return deferred.promise;
	},

	getTripRoute: function(trip_uuid){
		var deferred = Q.defer();
		var self = this;
		Q.when(driverInsightsAnalyze.getDetail(trip_uuid), function(response){
			var trip_id = response.trip_id;
			self.getTripRouteById(trip_id).then(function(geoJson){
				deferred.resolve(geoJson);
			});
		})["catch"](function(error){
			console.error(error);
			deferred.reject(error);
		});
		return deferred.promise;
	},

	/**
	 * Set job_id when a job expected to contain the trip is requested
	 */
	setJobId: function(job_id, from, to){
		var _from = moment(from).startOf("day").valueOf();
		var _to = moment(to).endOf("day").valueOf();
		var self = this;
		this._searchTripsIndex({q: '*:* AND NOT org_ts:[' + _to + ' TO Infinity] AND NOT last_ts:[0 TO ' + _from + ']'})
			.then(function(result){
				var tripIds = result.rows.map(function(row){
					return row.id;
				});
				if (tripIds.length > 0) {
					self.setJobIdToStatus(job_id, tripIds);
				}
			});
	},
	/**
	 * Set job status of all trips which should be analyzed by a job (job_id)
	 */
	setJobStatus: function(job_id, status){
		var self = this;
		this._searchJobStatusIndex({q: "job_id:" + job_id, include_docs: true})
			.then(function(result){
				var docs = result.rows.map(function(row){
					var doc = row.doc;
					doc = _.extend(doc, {job_status: status});
					return doc;
				});
				Q.when(self.db, function(db){
					db.bulk({docs: docs}, "insert", function(err, body){
						if(err){
							console.error("set job_status failed");
						}else{
							debug("set job_status succeeded");
						}
					});
				})["catch"](function(error){
					console.error(error);
				});
			});
	},

	setJobIdToStatus: function(job_id, tripIds) {
		var self = this;
		var deferred = Q.defer();
		Q.when(this.db, function(db){
			var query = {q: _.map(tripIds, function(id) {return 'trip_id:' + id;}).join(' '), include_docs: true};
			self._searchJobStatusIndex(query).then(function(result) {
				// add new parameters and update docs
				var withJobId = {}, withoutJobId = {};
				result.rows.forEach(function(row){
					if(row.doc.job_id === "-"){
						var doc = row.doc;
						doc = _.extend(doc, {job_id: job_id});
						withoutJobId[row.doc.trip_id] = row.doc;
					}else{
						withJobId[row.doc.trip_id] = row.doc;
					}
				});
				var updatedDocs = tripIds.filter(function(tripId){
					return !withJobId[tripId] && !withoutJobId[tripId];
				}).map(function(tripId){
					return {
						_id: JOB_STATUS_PREFIX + tripId,
						type: "job_status",
						trip_id: tripId,
						job_id: job_id,
						job_status: driverInsightsAnalyze.TRIP_ANALYSIS_STATUS.NOT_STARTED
					}
				}).concat(withoutJobId);
				Q.when(self.db, function(db){
					db.bulk({docs: updatedDocs}, "insert", function(err, body){
						if(err){
							console.error("set job_id failed");
						}else{
							debug("set job_id succeeded");
						}
					});
				});
			});
		});
		return deferred.promise;
	},
	getJobStatus: function(trip_id) {
		var deferred = Q.defer();
		var self = this;
		Q.when(self.db, function(db){
			var job_id = JOB_STATUS_PREFIX + trip_id;
			db.get(job_id, function(err, body){
				if(err){
					if(err.statusCode === 404){
						deferred.resolve({
							_id: JOB_STATUS_PREFIX + trip_id,
							type: "job_status",
							trip_id: trip_id,
							job_status: driverInsightsAnalyze.TRIP_ANALYSIS_STATUS.NOT_STARTED
						});
					}else{
						console.error(err);
						deferred.reject(err);
						return;
					}
				}
				deferred.resolve(body)
			});
		})["catch"](function(error){
			console.error(error);
			deferred.reject(error);
		});
		return deferred.promise;
	},

	getTripsByDevice: function(deviceID, limit){
		return this._searchTripsIndex({q:'deviceID:'+deviceID, sort: '-org_ts', limit:(limit||5)})
			.then(function(result){
				return result.rows.map(function(row){ return row.fields; });
			});
	},
	_searchTripsIndex: function(opts){
		return this._searchIndex('trips', opts);
	},
	_searchJobStatusIndex: function(opts){
		return this._searchIndex('job_status', opts);
	},
	_searchIndex: function(indexName, opts){
		return Q(this.db).then(function(db){
			var deferred = Q.defer();
			db.search(TRIPROUTES_DB_NAME, indexName, opts, function(err, result){
				if (err)
					return deferred.reject(err);
				return deferred.resolve(result);
			});
			return deferred.promise;
		});
	},
	_getDesignDoc: function(){
		var deviceTripIndexer = function(doc){
			if(doc.routes && Array.isArray(doc.routes) && doc.routes.length > 0){
				var route0 = doc.routes[0];
				if(route0.trip_id){
					// this looks like a trip
					index('deviceID', doc.deviceID || route0.id, {store:true});
					index('trip_id', route0.trip_id, {store:true});
					// origin info
					index('org_lat', parseFloat(route0.lat), {store:true});
					index('org_lng', parseFloat(route0.lng), {store:true});
					index('org_ts', parseFloat(route0.ts), {store:true}); // timestamp in millis
					index('last_ts', parseFloat(doc.routes[doc.routes.length-1].ts), {store:true});
				}
			}
		};
		var jobStatusIndexer = function(doc){
			if (doc.type === "job_status") {
				index('trip_id', doc.trip_id, {store:true});
				index('job_id', doc.job_id||"-", {store: true});
			}
		};
		var designDoc = {
				_id: '_design/' + TRIPROUTES_DB_NAME,
				indexes: {
					trips: {
						analyzer: {name: 'keyword'},
						index: deviceTripIndexer.toString()
					},
					job_status: {
						analyzer: {name: 'keyword'},
						index: jobStatusIndexer.toString()
					}
				}
		};
		return designDoc;
	},
});
tripRoutes._init();
