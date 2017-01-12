/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var ICON_WIDTH = 20;
var fromProjection = new OpenLayers.Projection("EPSG:4326");   // Transform from WGS 1984
var toProjection   = new OpenLayers.Projection("EPSG:900913"); // to Spherical Mercator Projection
var zoom           = 14;
var map;
var markerImages = {
		Start: "/images/MarkerWhite.png",
		End: "/images/MarkerBlack.png",
		"Harsh acceleration": "/images/MarkerAqua.png",
		"Harsh braking": "/images/MarkerBlue.png",
		"Speeding": "/images/MarkerGreen.png",
		"Frequent stops": "/images/MarkerIndigo.png",
		"Frequent acceleration": "/images/MarkerOrange.png",
		"Frequent braking": "/images/MarkerPink.png",
		"Sharp turn": "/images/MarkerPurple.png",
		"Acceleration before turn": "/images/MarkerRed.png",
		"Over-braking before exiting turn": "/images/MarkerSkyBlue.png",
		"Fatigued driving": "/images/MarkerYellow.png",
	};

$(document).ready(function() {

	//
	// INITIALIZE MAP
	//
	map = new OpenLayers.Map("canvas");

	var mapnik = new OpenLayers.Layer.OSM("OpenStreetMap",
		// Official OSM tileset as protocol-independent URLs
		[
			'//a.tile.openstreetmap.org/${z}/${x}/${y}.png',
			'//b.tile.openstreetmap.org/${z}/${x}/${y}.png',
			'//c.tile.openstreetmap.org/${z}/${x}/${y}.png'
		], null);
	map.addLayer(mapnik);

	var markers = new OpenLayers.Layer.Markers("Markers");
	map.addLayer(markers);

	var lonLat = new OpenLayers.LonLat(139.76, 35.68).transform(fromProjection, toProjection);
	map.setCenter(lonLat, zoom);

	var addMaker = function(lng, lat, index, behaviorName){
		var position = new OpenLayers.LonLat(lng, lat).transform(fromProjection, toProjection)
		var image = markerImages[behaviorName];
		var marker = null;
		if(image){
			var icon = new OpenLayers.Icon(image, {w: ICON_WIDTH}, {x: -ICON_WIDTH/2, y: -ICON_WIDTH});
			marker = new OpenLayers.Marker(position, icon);
		}else{
			marker = new OpenLayers.Marker(position);
		}
		markers.addMarker(marker);
		if(index==0) map.setCenter(position, zoom);
	};

	$canvas = $('#canvas');
	$canvas.on('resize', function() {
		$(this).css('height', ($(this).width() * 0.75) + 'px');
		setTimeout(map.updateSize(), 100);
	}).trigger('resize');

	$.ajax({
		url: '/user/driverInsights/statistics',
		type: 'GET',
		dataType: 'json', // needed?
		success: function(data) {
			if (data && data.scoring && data.scoring.score) {
				drawScoreChart('#driving_score_chart', data.scoring.score);
				$('.mileage_dist').each(function() {
					var sel = '#' + $(this).attr('id');
					var key = $(this).attr('data-key');
					drawMileageDistributionChart(sel, data[key]);
				});
				drawUnsafeDrivingChart('#unsafe_driving_chart', data.scoring);
			}
		},
		error: function(x, t, m) {
			$("#status").html('<div class="alert alert-danger" role="alert">' + JSON.stringify(t) + '</div>');
		}
	});

	$.ajax({
		url: '/user/driverInsights/behaviors/latest',
		type: 'GET',
		dataType: 'json', // needed?
		success: function(data) {
			// display locations with behaviors
			data.locations.forEach(function(loc) {
				if(loc.behaviors){
					loc.behaviors.forEach(function(l, index){
						addMaker(l.start_longitude, l.start_latitude, index, l.behavior_name);
						addMaker(l.end_longitude, l.end_latitude, index, l.behavior_name);
					});
				}
			});
			addMaker(data.start_longitude, data.start_latitude, null, "Start");
			addMaker(data.end_longitude, data.end_latitude, null, "End");
			drawTripRoute(data.trip_uuid);

			// draw behavior bars
			for (var behaviorName in data.behaviors) {
				behaviorId = 'behavior_' + behaviorName.replace(/ /g, '_'); // remove spaces
				$('#trip_analysis').append('<img src="' + markerImages[behaviorName] + '" width="16px" alt="' + behaviorName + '"/><span>' + behaviorName + '</span>');
				$('#trip_analysis').append('<div class="progress" id="' + behaviorId + '"></div>');
				drawDrivingBehaviorChart('#' + behaviorId, behaviorName, data);
			}
			// draw total score
			if (data && data.scoring && data.scoring.score) {
				var	score = Math.round(data.scoring.score || 0);
				$('#trip_score_bar').css('width', data.scoring.score + '%');
				$('#trip_score_bar').text(score + '');
			}
		},
		error: function(x, t, m) {
			$("#status").html('<div class="alert alert-danger" role="alert">' + JSON.stringify(t) + '</div>');
		}
	});

	function drawTripRoute(trip_uuid){
		var triplocation = "/user/driverInsights/triproutes/" + trip_uuid;
		var routeName = "route: " + trip_uuid;
		var routeStyle = OpenLayers.Util.extend({}, OpenLayers.Feature.Vector.style['default']);
		routeStyle = OpenLayers.Util.extend(routeStyle, {
			strokeColor: "green",
			strokeWidth: 5
		});
		var route = new OpenLayers.Layer.Vector(routeName, {
			projection: fromProjection,
			strategies: [new OpenLayers.Strategy.Fixed()],
			protocol: new OpenLayers.Protocol.HTTP({
				url: triplocation,
				format: new OpenLayers.Format.GeoJSON()
			}),
			style: routeStyle,
			onFeatureInsert: function(feature){
				map.zoomToExtent(feature.layer.getDataExtent());
			}
		});
		map.addLayer(route);
	}

	function drawDrivingBehaviorChart(sel, behaviorName, data) {
		var t0 = data.start_time;
		var dur = (data.end_time - data.start_time);
		var $p = $(sel);

		function p(t) { // calculate percentatage in this trip for given time t.
			return 100.0 * (t - t0) / dur;
		}

		var cursor = 0.0;
		data.behaviors[behaviorName].forEach(function(val, index, ar) {
			var start = p(val.start_time), end = p(val.end_time);
			if (cursor < start - 1.0) {
				$b = $('<div class="progress-bar progress-bar-success"></div>');
				$b.css('width', (start - cursor) + '%');
				$p.append($b);
				cursor = start;
			}
			if (cursor < end - 1.0) {
				$b = $('<div class="progress-bar progress-bar-danger"></div>');
				$b.css('width', (end - cursor) + '%');
				$p.append($b);
				cursor = end;
			}
		});
		if (cursor < 100.) {
			$b = $('<div class="progress-bar progress-bar-success"></div>');
			$b.css('width', (100. - cursor) + '%');
			$p.append($b);
		}
	}

	function drawScoreChart(sel, score) {
		// score must be a Number
		score = Math.round(score || 0);
		c3.generate({
			bindto: sel,
			data: {columns: [["data", score]], type: 'gauge'},
			size: {height: 180},
		});
	}

	function drawMileageDistributionChart(sel, data) {
		// data is in {key: value, ..., totalDisntance: totalDist}
		var totalDistance = data.totalDistance;
		if (totalDistance < 0.1) return; // skip to draw the chart as no total distance
		// prepare data for the cahrt
		var chartCols = [];
		for (var pn in data) {
			if (pn == 'totalDistance') continue;
			chartCols.push([pn, data[pn]])
		}
		console.log('ChartCols: ' + chartCols);
		c3.generate({
			bindto: sel,
			data: {columns: chartCols, type: 'pie'},
			legend: {position: 'insert', insert: {'anchor': 'top-left', x: 10, y: 10, step: 2} },
		});
	}

	function drawUnsafeDrivingChart(sel, scoring) {
		// collect paris of key-vlaues which have "score" attribute
		var chartRows = [['x', 'data']];
		var chartGroups = [];
		for (var pn in scoring) {
			if (scoring[pn].score == undefined) continue; // skip non-score objects
				chartRows.push([pn, scoring[pn].count]);
				chartGroups.push(pn);
		}
		console.log('ChartCols: ' + chartRows);
		c3.generate({
			bindto: sel,
			data: {x: 'x', rows: chartRows, groups: [['data']], type: 'area'},
			axis: {x: {type: 'category'}},
			grid: {x: {show: true}},
			legend: {show: false},
		});

	}
})
