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
 * REST APIs using Driver Behavior service as backend
 */
var Q = require('q');
var router = module.exports = require('express').Router();
var authenticate = require('./auth.js').authenticate;
var driverInsightsProbe = require('../../driverInsights/probe');
var driverInsightsAnalyze = require('../../driverInsights/analyze');
var driverInsightsTripRoutes = require('../../driverInsights/tripRoutes.js');
var dbClient = require('../../cloudantHelper.js');

router.get('/probeData',  authenticate, function(req, res) {
	driverInsightsProbe.getCarProbeDataListAsDate().then(function(msg){
		res.send(msg);
	})["catch"](function(error){
		res.send(error);
	});
});

router.get('/driverInsights', authenticate, function(req, res) {
	getUserTrips(req).then(function(tripIdList){
		driverInsightsAnalyze.getList(tripIdList).then(function(msg){
			res.send(msg);
		});	
	})["catch"](function(error){
		res.send(error);
	});
});

router.get('/driverInsights/statistics', authenticate, function(req, res) {
	getUserTrips(req).then(function(tripIdList){
		driverInsightsAnalyze.getStatistics(tripIdList).then(function(msg){
			res.send(msg);
		});	
	})["catch"](function(error){
		res.send(error);
	});
});

router.get('/driverInsights/behaviors', authenticate, function(req, res) {
	getUserTrips(req).then(function(tripIdList){
		driverInsightsAnalyze.getTripList(tripIdList, req.query.all).then(function(msg){
			res.send(msg);
		});
	})["catch"](function(error){
		res.send(error);
	});
});

router.get('/driverInsights/:trip_uuid', authenticate, function(req, res) {
	driverInsightsAnalyze.getDetail(req.params.trip_uuid).then(function(msg){
		res.send(msg);
	})["catch"](function(error){
		res.send(error);
	});
});

router.get('/driverInsights/behaviors/latest', authenticate, function(req, res) {
	driverInsightsAnalyze.getLatestBehavior().then(function(msg){
		res.send(msg);
	})["catch"](function(error){
		res.send(error);
	});
});

router.get('/driverInsights/behaviors/:trip_uuid', authenticate, function(req, res) {
	driverInsightsAnalyze.getBehavior(req.params.trip_uuid).then(function(msg){
		res.send(msg);
	})["catch"](function(error){
		res.send(error);
	});
});

router.get("/driverInsights/triproutes/:trip_uuid", function(req, res){
	driverInsightsTripRoutes.getTripRoute(req.params.trip_uuid).then(function(msg){
		res.send(msg);
	})["catch"](function(error){
		res.send(error);
	})
});
router.get("/driverInsights/tripanalysisstatus/:trip_id", function(req, res){
	driverInsightsAnalyze.getTripAnalysisStatus(req.params.trip_id).then(function(msg){
		res.send(msg);
	})["catch"](function(error){
		res.send(error);
	});
});

router.get("/triproutes/:trip_id", function(req, res){
	driverInsightsTripRoutes.getTripRouteById(req.params.trip_id, req.query).then(function(msg){
		res.send(msg);
	})["catch"](function(error){
		res.send(error);
	})
});

function getUserTrips(req){
	var userid = req.user && req.user.id;
	if(!userid){
		return Q([]);
	}
	var deferred = Q.defer();
	dbClient.searchView("closedReservations", {key: userid}).then(
		function(result){
			var trip_ids = result.rows.map(function(item) {
				var reservation = item.value;
				return reservation.trip_id;
			}).filter(function(trip_id){
				return trip_id;
			});
			deferred.resolve(trip_ids);
		}
	)["catch"](function(error){
		deferred.reject(error);
	});
	return deferred.promise;
}