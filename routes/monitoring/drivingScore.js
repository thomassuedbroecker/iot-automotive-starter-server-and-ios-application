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
 * Debug: DEBUG=monitoring:drivingScore
 */
var router = module.exports = require('express').Router();
var Q = require('q');
var _ = require('underscore');

var driverInsightsAnalyze = require('../../driverInsights/analyze.js');
var drivingDataSync = require('./drivingDataSync.js');

var debug = require('debug')('monitoring:drivingScore');
debug.log = console.log.bind(console);

router.get('/drivingScore/userCount', function(req, res){
	drivingDataSync.db.view(null, 'users', {group: true}).then(function(result){
		debug('Result for userCount: ', result);
		res.send({value: (result.rows || []).length});
	})['catch'](function(er){
		res.status(500).send(er);
	}).done();
});

router.get('/drivingScore/tripCount', function(req, res){
	drivingDataSync.db.view(null, 'users', {reduce: true}).then(function(result){
		var count = (result.rows || []).reduce(function(memo, row){ return memo + row.value}, 0);
		debug('Result for tripsCount: ', count);
		res.send({value: count});
	})['catch'](function(er){
		res.status(500).send(er);
	}).done();
});

/**
 * Get dirving score distribution for the Dounat Chart
 * 
 * GET /monitoring/drivingScore/distribution[?ranges={range}]
 * where
 *  - range: {'name1': 'range in Lucene form',
 *            'name2': 'range in Lucene form', ...}
 *        - range: e.g. [0 TO 10}  (0 <= x < 10)
 * Result:
 * { columns: [
 *    ["name1", v11, v12],
 *    ["name2", v21, v22],..
 *   ],
 *   average: (average score)
 * }
 */
router.get('/drivingScore/distribution', function(req, res){
	var getAverage = drivingDataSync.db.view(null, 'scoreByUser', {reduce: true})
		.then(function(result){
			if(result.rows && result.rows.length > 0)
				return result.rows[0].value;
			return undefined;
		});
	
	var ranges;
	if(req.query.ranges){
		ranges = {score: JSON.parse(req.query.ranges)};
	}else{
		ranges = {score: {
			'0 to 50': '[0 TO 50}',
			'50 to 70': '[50 TO 70}',
			'70 to 85': '[70 TO 85}',
			'85 to 100': '[85 TO 100]',
		}};
	}
	var getColumns = drivingDataSync.db.search(null, 'score', 
			{q:'*:*', score:'[0 TO 100]', ranges:ranges, counts:['score']})
		.then(function(result){
			return _.pairs(result.ranges.score);
		});
	
	Q.spread([getAverage, getColumns], function(average, cloumns){
		res.send({
			average: average,
			columns: cloumns
		});
	})['catch'](function(er){
		res.status(500).send(er);
	}).done();
});

router.get('/drivingScore/byZone', function(req, res){
	var getColumns = drivingDataSync.db.view(null, 'scoreByZone', {group: true}).then(function(result){
		var avgs = (result.rows || []).map(function(row){
			// return [zone name, zone average score]
			var avg = (row.value.count ? row.value.sum / row.value.count : '--');
			return avg;
		});
		var cities = (result.rows || []).map(function(row){
			return row.key[1];
		});
		return {
			columns: [['Score Average'].concat(avgs)],
			categories: [].concat(cities),
		};
	});
	
	Q.spread([getColumns], function(cloumns){
		res.send(cloumns);
	})['catch'](function(er){
		res.status(500).send(er);
	}).done();
});


router.get('/drivingScore/byZoneFromBehavior', function(req, res){
	var getColumns = drivingDataSync.db.view(null, 'behaviorScoreByZone', {group: true}).then(function(result){
		var avgs = (result.rows || []).map(function(row){
			// return [zone name, zone average score]
			var avg = (row.value.count ? row.value.sum / row.value.count : '--');
			return avg;
		});
		var cities = (result.rows || []).map(function(row){
			return row.key[1];
		});
		return {
			columns: [['Score Average'].concat(avgs)],
			categories: [].concat(cities),
		};
	});
	
	Q.spread([getColumns], function(cloumns){
		res.send(cloumns);
	})['catch'](function(er){
		res.status(500).send(er);
	}).done();
});


