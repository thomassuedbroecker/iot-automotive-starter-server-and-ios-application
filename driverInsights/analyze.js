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
 
var driverInsightsAnalyze = module.exports = {};

var _ = require("underscore");
var Q = require("q");
var request = require("request");
var cfenv = require("cfenv");
var fs = require("fs-extra");
var moment = require("moment");
var driverInsightsProbe = require("./probe.js");
var driverInsightsTripRoutes = require('./tripRoutes.js');
var debug = require('debug')('analyze');
debug.log = console.log.bind(console);

var behaviorNames = [
		"Harsh acceleration",
		"Harsh braking",
		"Speeding",
		"Frequent stops",
		"Frequent acceleration",
		"Frequent braking",
		"Sharp turn",
		"Acceleration before turn",
		"Over-braking before exiting turn",
		"Fatigued driving"];

var WATCH_JOB_STATUS_INTERVAL = new Number(process.env.WATCH_JOB_STATUS_INTERVAL || 60000);

/*
 * driverInsightsAnalyze is an exported module
 */
_.extend(driverInsightsAnalyze, {
	TRIP_ANALYSIS_STATUS: {
		NOT_STARTED: {id: "0", status: "NOT_STARTED", message: "Driver behavior analysis not started"},
		PENDING: {id: "1", status: "PENDING", message: "Driver behavior results pending"},
		SUCCEEDED: {id: "2", status: "SUCCEEDED", message: "Driver behavior analysis succeeded"},
		FAILED: {id: "3", status: "FAILED", message: "Driver behavior analysis failed"}
	},

	// Configurations for Driver Behavior service is specified in ./probe.js
	driverInsightsConfig: driverInsightsProbe.driverInsightsConfig,

	last_job_ts: 0, // Set an old date to analyze all probe data if no analysis has requested before

	watchingJobs: [], // List of watching jobs to delete duplicated analyze results
	timeoutId: null,
	requestQueue: [],

	authOptions: {
		rejectUnauthorized: false,
		auth: {
			user: driverInsightsProbe.driverInsightsConfig.username,
			pass: driverInsightsProbe.driverInsightsConfig.password,
			sendImmediately: true
		}
	},

	/**
	 * Send an analysis job to Driver Behavior service.
	 */
	sendJobRequest: function(from/*YYYY-MM-DD*/, to/*YYYY-MM-DD*/){
		this.getJobInfoList((function(jobList){
			if(jobList.some(function(job){return job.job_status === "RUNNING"})){
				console.log("Don't send a job: There are running jobs from this server.");
				return;
			}
			jobList = jobList.filter(function(job){return job.job_status === "SUCCEEDED";});
			if(this.last_job_ts === 0 && jobList.length > 0){
				this.last_job_ts = jobList.map(function(job){return moment(job.to).valueOf()})
										  .sort(function(a, b){return b - a;})[0];
			};
			if(this.last_job_ts >= driverInsightsProbe.last_prob_ts){
			// don't send a job if there are no update in probe data
			// since last submit of a job.
				console.log("Don't send a job: last_job_ts=" + this.last_job_ts + ", last_prob_ts=" + driverInsightsProbe.last_prob_ts);
				return;
			}

			from = from || moment(this.last_job_ts).format("YYYY-MM-DD");
			to = to || moment().format("YYYY-MM-DD");
			if(from === to){
				this._sendJobRequest(from, to);
			}else{
				var one_day_before_to = moment(to).subtract(1, "days").format("YYYY-MM-DD");
				this._sendJobRequest(from, one_day_before_to);
				this._sendJobRequest(to, to);
			}
		}).bind(this));
	},
	_sendJobRequest: function(from, to){
		if(!from || !to){
			console.log("Specify 'from' and 'to' or use sendJobRequest function instead of _sendJobRequest");
			return;
		}

		var config = this.driverInsightsConfig;
		var api = "/jobcontrol/job";
		var body = JSON.stringify({
			from: from,
			to: to
		});
		var options = {
			method: 'POST',
			url: config.baseURL+api+'?tenant_id='+config.tenant_id,
			headers: {
				'Content-Type':'application/json; charset=UTF-8',
				"Content-Length": Buffer.byteLength(body)
			},
			body: body
		};
		_.extend(options, this.authOptions);
		console.log("Call SendJobRequest: " + JSON.stringify(options));
		var self = this;
		request(options, function(error, response, body){
			if (!error && response.statusCode === 200) {
				console.log('SendJobRequest successfully done: '+ body);
				var body = JSON.parse(body);
				if(body.job_id){
					self.watchingJobs.push(body.job_id);
					self._setWatchingTask();
					driverInsightsTripRoutes.setJobId(body.job_id, from, to);
				}
				self.last_job_ts = moment().valueOf();
			} else {
				console.error('SendJobRequest error: '+ body +
						'\n response: ' + JSON.stringify(response) +
						'\n error: ' + JSON.stringify(error));
			}
		});
	},

	/**
	 * Get summary of a trip.
	 * The response is as is of response from Driver Behavior service.
	 * @param trip_id (optional)
	 * @alias: getAnalyzedTripSummaryList
	 */
	getSummary: function(trip_id){
		var deferred = Q.defer();

		var config = this.driverInsightsConfig;
		var url = config.baseURL+'/drbresult/tripSummaryList?tenant_id='+config.tenant_id;
		if(trip_id){
			url = url + '&trip_id=' + trip_id;
		}
		var options = {
			method: 'GET',
			url: url
		};
		_.extend(options, this.authOptions);
		request(options, function(error, response, body){
			if (!error && response.statusCode === 200) {
				var value = JSON.parse(body);
				if(value.length == 0 && trip_id){
					deferred.reject({trip_id: trip_id});
				}else{
					deferred.resolve(value);
				}
			} else {
				var msg = 'analyze: error(getSummary): '+ body;
				console.error(msg);
				deferred.reject({message: msg, trip_id: trip_id});
			}
		});

		return deferred.promise;
	},

	/*
	 * Get list of analysis result.
	 * The response is as is of response from Driver Behavior service.
	 * @param idList list of {trip_id, trip_uuid}
	 * @param summary (optional) true to get summary of each trip, false to get detail of each trip
	 * @param allTrips (optional) true to get all trips including trips that don't have a corresponding analysis result yet
	 */
	_getListOfTrips: function(idList, summary, allTrips){
		if(!idList || idList.length == 0){
			return Q([]);
		}
		var maxNumOfConcurrentCall = 8;
		var deferred = Q.defer();
		var retrieveMethod = this[summary ? "getSummary" : "_getDetail"].bind(this);
		var numTrip = idList.length;
		var numResponse = 0;
		var results = [];

		var f = function(error, body){
			if(error && error.trip_id && allTrips){
				// may be analysis is not done yet
				// add raw trip info instead of analysis result
				var b = error;
				body = summary ? [b] : b;
			}
			if(body){
				if(summary){
					results = results.concat(body);
				}else{
					results.push(body);
				}
			}
			if (++numResponse==numTrip) {
				deferred.resolve(results);
			}else if(idList.length > 0){
				var id = idList.shift();
				retrieveMethod(id.trip_id, id.trip_uuid).then(successf, f);
			}
		}.bind(this);
		var successf = function(body){
			f(null, body);
		};
		for(var i=0; i<Math.min(maxNumOfConcurrentCall, numTrip); i++){
			var id = idList.shift();
			retrieveMethod(id.trip_id, id.trip_uuid).then(successf, f);
		}

		return deferred.promise;
	},

	getList: function(tripIdList, allTrips){
		this.sendJobRequest();

		if(tripIdList){
			var idList = tripIdList.map(function(id){
				return {trip_id: id};
			});
			return this._getListOfTrips(idList, true, allTrips);
		}else{
			return this.getSummary();
		}
	},

	/**
	 * Get an analysis result.
	 * The response is as is of response from Driver Behavior service.
	 * @alias getAnalyzedTripInfo
	 */
	getDetail: function(tripuuid) {
		return this._getDetail(null, tripuuid);
	},

	/*
	 * Get an analysis result.
	 * The response is as is of response from Driver Behavior service.
	 */
	_getDetail: function(trip_id, tripuuid) {
		if(tripuuid){
			var deferred = Q.defer();

			var config = this.driverInsightsConfig;
			var api = "/drbresult/trip";
			var options = {
				method: 'GET',
				url: config.baseURL+api+'?tenant_id='+config.tenant_id+'&trip_uuid='+tripuuid
			};
			_.extend(options, this.authOptions);
			request(options, function(error, response, body){
				if (!error && response.statusCode === 200) {
					deferred.resolve(JSON.parse(body));
				} else {
					var msg = 'analyze: error(_getDetail): ' + error;
					console.error(msg);
					deferred.reject({message: msg, trip_id: trip_id});
				}
			});
			return deferred.promise;

		}else if(trip_id){
			var deferred = Q.defer();
			driverInsightsTripRoutes.getTripInfo(trip_id).then(function(info){
				deferred.reject(_.extend(info, {message: "not analyzed yet"}));
			})["catch"](function(error){
				var msg = 'analyze: error(_getDetail): ' + error;
				console.error(msg);
				deferred.reject({message: msg, trip_id: trip_id});
			});
			return deferred.promise;

		}else{
			return Q({message: "trip_id nor trip_uuid is not specified"});
		}
	},

	getTripAnalysisStatus: function(trip_id){
		var deferred = Q.defer();
		var self = this;

		driverInsightsTripRoutes.getJobStatus(trip_id)
			.then(function(jobStatus){
				var job_status = jobStatus.job_status;
				if(job_status && job_status.id !== self.TRIP_ANALYSIS_STATUS.NOT_STARTED.id && job_status.id !== self.TRIP_ANALYSIS_STATUS.PENDING.id){
					deferred.resolve(jobStatus.job_status);
				}else if(jobStatus.job_id){
					self.refreshTripAnalysisStatus(jobStatus.job_id).then(function(status){
						deferred.resolve(status);
					});
				}else{
					// This trip is created on the old version server
					// A trip which doesn't have all of job_id, job_status and trip_uuid must be failed to analyze
					deferred.resolve(self.TRIP_ANALYSIS_STATUS.FAILED);
				}
			});
		return deferred.promise;
	},
	refreshTripAnalysisStatus: function(job_id){
		var deferred = Q.defer();
		var self = this;
		this.getJobInfo(job_id, function(jobInfo){
			var status = null;
			if(jobInfo){
				switch(jobInfo.job_status){
				case "RUNNING":
					status = self.TRIP_ANALYSIS_STATUS.PENDING;
					break;
				case "SUCCEEDED":
					// Analysis for the trip seemed to be failed if trip_uuid is not assigned even though the analyze job is succeeded.
					// fallthrough
				case "KILLED":
					// fallthrough
				default:
					// Default can be fail because this status only checked when trip_uuid is not assigned to the tripRoutes
					status = self.TRIP_ANALYSIS_STATUS.FAILED;
				break;
				}
			}else{
				// The job has been replaced by an other succeeded job
				// TODO job_id should be updated when jobs are replaced
				status = self.TRIP_ANALYSIS_STATUS.FAILED;
			}

			driverInsightsTripRoutes.setJobStatus(job_id, status);
			deferred.resolve(status);
		}, function(err, response, body){
			if(response && response.statusCode === 400){
				// The job has been replaced by an other succeeded job
				var status = self.TRIP_ANALYSIS_STATUS.FAILED;

				driverInsightsTripRoutes.setJobStatus(job_id, status);
				deferred.resolve(status);
				return;
			}
			self._handleError(err, response, body);
			deferred.reject(status);
		});
		return deferred.promise;
	},

	/**
	 * Get the latest driver behavior.
	 */
	getLatestBehavior: function() {
		var deferred = Q.defer();

		var self = this;
		this.getList().then(function(response){
			if(response && response.length > 0){
				self.getBehavior(response[response.length-1].id.trip_uuid).then(function(body){
					deferred.resolve(body);
				}, function(error){
					deferred.reject(error);
				});
			}else{
				deferred.resolve({});
			}
		}, function(error){
			deferred.reject(error);
		});

		return deferred.promise;
	},

	/**
	 * Get an driver behavior specified by trip uuid.
	 */
	getBehavior: function(tripuuid) {
		var deferred = Q.defer();

		var self = driverInsightsAnalyze;
		self.getDetail(tripuuid).then(function(response){
			var subtripsarray = response.ctx_sub_trips;
			if(!subtripsarray){
				console.error('analyze: error(getBehavior): no subtrip');
				deferred.reject({message: "analyze: error(getBehavior): no subtrip"});
				return;
			}
			subtripsarray.sort(function(a,b){
				return a.start_time > b.start_time ? 1 : -1;
			});
			var body = {
				trip_uuid: tripuuid,
				start_time: response.start_time,
				end_time: response.end_time,
				start_latitude: response.start_latitude,
				start_longitude: response.start_longitude,
				end_latitude: response.end_latitude,
				end_longitude: response.end_longitude,
				trip_id: response.trip_id,
				mo_id: response.mo_id,
			};
			// behaviors
			var behaviors = {};
			behaviorNames.forEach(function(name){ behaviors[name] = []; });

			subtripsarray.forEach(function(subtrip){
				var driving_behavior_details = subtrip.driving_behavior_details;
				driving_behavior_details.forEach(function(bhr){
					var name = bhr.behavior_name;
					if(!behaviors[name]) {
						behaviors[name] = [];
					}
					behaviors[name].push({start_time: bhr.start_time, end_time: bhr.end_time});
				});
			});
			body.behaviors = behaviors;
			// locations
			var locations = [];
			subtripsarray.forEach(function(subtrip){
				var loc = {
					start_latitude: subtrip.start_latitude,
					start_longitude: subtrip.start_longitude,
					end_latitude: subtrip.end_latitude,
					end_longitude: subtrip.end_longitude
				};
				var driving_behavior_details = subtrip.driving_behavior_details;
				if(driving_behavior_details && driving_behavior_details.length > 0){
					loc.behaviors = driving_behavior_details.map(function(bhr){
						return {
							start_latitude: bhr.start_latitude,
							start_longitude: bhr.start_longitude,
							end_latitude: bhr.end_latitude,
							end_longitude: bhr.end_longitude,
							behavior_name: bhr.behavior_name
						};
					});
				}
				locations.push(loc);
			});
			body.locations = locations;
			// scoring
			body.scoring = self._calculateBehaviorScores(response);

			deferred.resolve(body);

		}, function(error){
			deferred.reject(error);
		});

		return deferred.promise;
	},

	/*
	 * Get list of driver behaviors.
	 * The response is as is of response from Driver Behavior service.
	 * @param ids list of {trip_uuid, trip_id}
	 * @param allTrips true to get all trips including trips that don't have a corresponding analysis result yet.
	 * @param If allTrips is true, The ids should contains trip_id.
	 */
	_getListOfDetail:function(ids, allTrips) {
		return this._getListOfTrips(ids, false, allTrips);
	},

	/*
	 * Calculate driving score for a trip.
	 */
	_calculateBehaviorScores: function(trip, scoring){
		if(!trip.id){
			// not analyzed yet
			return scoring || {score:0};
		}
		var scoring = scoring || {
			totalTime: 0,
			allBehavior: {totalTime: 0, score:100}
		};
		var trip_total_time = trip.end_time - trip.start_time;
		scoring.totalTime += trip_total_time;

		behaviorNames.forEach(function(name){
			if(!scoring[name]){
				scoring[name] = {
					totalTime:0,
					count:0
				};
			}
		});
		// calculate time for each behavior in each sub trip
		var trip_total_badbehavior_time = 0;
		if (trip.ctx_sub_trips && trip.ctx_sub_trips.length > 0) {
			var subtripsarray = trip.ctx_sub_trips;
			// each sub trip
			var all_behaviors = [];
			subtripsarray.forEach(function(subtrip, subtripindex){
				var driving_behavior_details = subtrip.driving_behavior_details;
				if (driving_behavior_details && driving_behavior_details.length > 0) {
					// each behavior
					driving_behavior_details.forEach(function(bhr){
						var name = bhr.behavior_name;
						var behavior = scoring[name];
						behavior.totalTime += (bhr.end_time - bhr.start_time);
						behavior.count++;
						all_behaviors.push({s:bhr.start_time, e:bhr.end_time});
					});
				}
			});
			// gather all behaviors in this trip
			all_behaviors.sort(function(a,b){
				return a.s - b.s;
			});
			// remove dup time
			for(var i=all_behaviors.length-1;i>0;){
				if(all_behaviors[i-1].e > all_behaviors[i].s){
					if(all_behaviors[i-1].e < all_behaviors[i].e){
						all_behaviors[i-1].e = all_behaviors[i].e;
					}
					all_behaviors.splice(i,1);
					if(i == all_behaviors.length) i--;
				}else{
					i--;
				}
			}
			var totalBehaviorTime = 0;
			all_behaviors.forEach(function(t){
				totalBehaviorTime += t.e - t.s;
			});
			scoring.allBehavior.totalTime += totalBehaviorTime;
		}
		// calculate score for each behavior and behaviorTotal
		for (var pname in scoring) {
			if (pname !== "totalTime" && pname !== "score") {
				scoring[pname].score = Math.min((1.0 - (scoring[pname].totalTime / scoring.totalTime)) * 100.0, 100.0);
			}
		}
		// calculate score for this trip
		scoring.score = scoring.allBehavior.score;
		return scoring;
	},

	/**
	 * Get list of driving behavior.
	 */
	getTripList: function(tripIdList, allTrips) {
		var deferred = Q.defer();

		var self = this;
		this.getList(tripIdList, allTrips).then(function(response){
			if(response && response.length > 0){
				var ids = response.map(function(summary){
					return {trip_uuid: summary.id && summary.id.trip_uuid, trip_id: summary.trip_id};
				});
				self._getListOfDetail(ids, allTrips).then(function(results){
					var tripList = results.map(function(trip){
						var scoring = self._calculateBehaviorScores(trip);
						return {
							"score": scoring.score,
							"trip_id": trip.trip_id,
							"trip_uuid": trip.id && trip.id.trip_uuid,
							"mo_id": trip.mo_id,
							"start_time": trip.start_time,
							"end_time": trip.end_time,
							"start_altitude": trip.start_altitude,
							"start_latitude": trip.start_latitude,
							"start_longitude": trip.start_longitude,
							"end_altitude": trip.end_altitude,
							"end_latitude": trip.end_latitude,
							"end_longitude": trip.end_longitude
						};
					});
					deferred.resolve(tripList);
				}, function(error){
					deferred.reject(error);
				});
			}else{
				deferred.resolve([]); // empty
			}
		}, function(error){
			deferred.reject(error);
		});

		return deferred.promise;
	},

	/**
	 * Get statistics of driving behavior.
	 */
	getStatistics: function(tripIdList) {
		var deferred = Q.defer();

		var self = this;
		this.getList(tripIdList).then(function(response){
			if(response && response.length > 0){
				var tripuuids = response.map(function(summary){
					return {trip_uuid: summary.id && summary.id.trip_uuid};
				});
				self._getListOfDetail(tripuuids).then(function(results){
					//summarize response here
					var body = {
							totalDistance  : 0.0
					}
					if (results && results.length > 0) {
						var scoring = null;
						var beviornames = [];
						results.forEach(function(result, resultindex){
							var distance = 0;
							var tripfeaturearray = result.trip_features;
							tripfeaturearray.forEach(function(tripfeature){
								if (tripfeature.feature_name == "distance") {
									distance =  tripfeature.feature_value - 0;
								}
							});
							body.totalDistance += distance;
							if (result.ctx_sub_trips && result.ctx_sub_trips.length > 0) {
								var subtripsarray = result.ctx_sub_trips;
								subtripsarray.forEach(function(subtrip, subtripindex){
									var subtripdistance = subtrip.length;
									// context features
									var ctx_features = subtrip.ctx_features;
									if (ctx_features && ctx_features.length > 0) {
										ctx_features.forEach(function(ctx_feature){
											var contextcategory = ctx_feature.context_category;
											if (!body[contextcategory]) {
												body[contextcategory] = {};
											}
											var bodycontext = body[contextcategory];
											var contextname = ctx_feature.context_name;
											if (!bodycontext[contextname]) {
												bodycontext[contextname] = 0;
											}
											bodycontext[contextname] += subtripdistance;
											if (!bodycontext.totalDistance) {
												bodycontext.totalDistance = 0;
											}
											bodycontext.totalDistance += subtripdistance;
										});
									}
								});
							}
							scoring = self._calculateBehaviorScores(result, scoring);
						});
						body["scoring"] = scoring;
						deferred.resolve(body);
					} else {
						console.error('analyze: error(getStatistics): Empty resonse');
						deferred.reject({message: 'analyze: error(getStatistics): Empty resonse'});
					}
				}, function(error){
					console.error('analyze: Error:' + error);
					deferred.reject({message: 'analyze: Error:' + error});
				});
			}else{
				deferred.resolve([]); // empty
			}
		}, function(error){
			deferred.reject(error);
		});
		return deferred.promise;
	},

	/**
	* Get Job List
	*/
	getJobInfoList: function(callback, errorback){
		console.log('Getting job list...');
		this._run("GET", "/jobcontrol/jobList", null, null, callback, errorback || (this._handleError).bind(this));
	},

	/**
	* Get a Job
	*/
	getJobInfo: function(job_id, callback, errorback){
		console.log('Getting job info: job_id = ' + job_id);
		this._run("GET", "/jobcontrol/job", {job_id: job_id}, null, callback, errorback || (this._handleError).bind(this));
	},

	/**
	* Delete a Job
	*/
	deleteJobResult: function(job_id, callback, errorback){
		console.log('Deleting job result: job_id = ' + job_id);
		this._run("DELETE", "/drbresult/jobResult", {job_id: job_id}, null, callback, errorback || (this._handleError).bind(this));
	},

	/*
	* Internal methods
	*/
	_run: function(method, api, uriParam, body, callback, errorback){
		if(!api){
			errorback();
			return;
		}
		var config = this.driverInsightsConfig;
		var uri = config.baseURL + api + "?tenant_id=" + config.tenant_id;
		if(uriParam === null || uriParam === undefined){
			//do nothing
		}else if(typeof uriParam === "string"){
			uri += uriParam; // "&key1=value1&key2=value2..."
		}else if(typeof uriParam === "object"){
			uri += "&" + Object.keys(uriParam).map(function(key){return key + "=" + uriParam[key];}).join("&");
		}
		var options = {
			method: method,
			url: uri,
			headers: {
				"Content-Type": "application/json; charset=UTF-8"
			}
		};
		_.extend(options, this.authOptions);
		if(body){
			options.body = JSON.stringify(body);
			options.headers["Content-Length"] = Buffer.byteLength(options.body);
		}

		debug("Request: " + JSON.stringify(options));
		request(options, function(err, response, body){
			if(!err && response.statusCode === 200){
				try{
					result = JSON.parse(body);
					callback(result);
				}catch(err){
					errorback(err, response, body);
				}
			}else{
				errorback(err, response, body);
			}
		});
	},

	_handleError: function(err, response, body){
		console.error("analyze: Error::" +
				(err || (response && response.statusCode + ": " + response.statusMessage)) +
				(body ? ('body::' + JSON.stringify(body) + '\n') : ''));
	},

	_watchJobStatus: function(){
		if(this.watchingJobs.length <= 0) return;

		var self = this;
		this.getJobInfoList(function(jobList){
			self.watchingJobs.forEach(function(watchedId, index){
				self.getJobInfo(watchedId, function(watchedInfo){
					if(watchedInfo.job_status === "RUNNING"){
						self._setWatchingTask();
					}else if(watchedInfo.job_status === "SUCCEEDED"){
						var watchedFrom = moment(watchedInfo.from).valueOf();
						var watchedTo = moment(watchedInfo.to).valueOf();
						jobList.forEach(function(jobInfo){
							if(watchedId !== jobInfo.job_id && jobInfo.job_status === "SUCCEEDED"){
								var otherFrom = moment(jobInfo.from).valueOf();
								var otherTo = moment(jobInfo.to).valueOf();
								var deleteJobId = null;
								if(watchedFrom === otherFrom && watchedTo === otherTo){
									// Delete prior submitted job if those ranges are same
									deleteJobId = watchedInfo.job_submit_time < jobInfo.job_submit_time ? watchedId : jobInfo.job_id;
								}else if(watchedFrom <= otherFrom && watchedTo >= otherTo){
									// Delete the other job when I'm containing the other job
									deleteJobId = jobInfo.job_id;
								}else if(watchedFrom >= otherFrom && watchedTo <= otherTo){
									// Delete me when I'm contained in the other job
									deleteJobId = watchedId;
								}
								if (deleteJobId) {
									self.deleteJobResult(deleteJobId, function(body){});
								}
							}
						});
						self.watchingJobs.splice(index, 1); // watchingJobs.forEach must be finished before any getJobInfo callback
					}else{
						// KILLED, etc
						self.watchingJobs.splice(index, 1); // watchingJobs.forEach must be finished before any getJobInfo callback
					}
				});
			});
		});

	},

	_setWatchingTask: function(){
		if(this.timeoutId){
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}
		if(this.watchingJobs.length > 0){
			this.timeoutId = setTimeout(this._watchJobStatus.bind(this), WATCH_JOB_STATUS_INTERVAL);
		}else{
			console.log("No more watching job left");
		}
	}
});


// Setup alias to align API names for analyzed info with
// https://console.ng.bluemix.net/docs/services/IotDriverInsights/index.html
driverInsightsAnalyze.getAnalyzedTripSummaryList = driverInsightsAnalyze.getSummary
driverInsightsAnalyze.getAnalyzedTripInfo = driverInsightsAnalyze.getDetail;
