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
 * This files for defining REST services for cars status information on the monitoring
 * console. Depending on the latency from the types of the information, this router offers two types
 * of services, a REST service and a WebSocket service.
 * 
 * The REST service provides car information which involves ones from back-end databases.
 * The /cars/query services is the implementation and provides device reservation status, which
 * is storeed in the application DB, as well as car status.
 * 
 * The WebSocket service only offers real-time information from the backend IoT Platform.
 * The endpoint can be obtained from the response of /cars/query REST service. 
 *
 * REST servies:
 *  /cars/qeury
 *  /cars/query?countby=status
 *
 * Debug: DEBUG=monitoring:cars
 */
var router = module.exports = require('express').Router();
var Q = require('q');
var _ = require('underscore');
var WebSocketServer = require('ws').Server;
var appEnv = require("cfenv").getAppEnv();

var cloudantHelper = require('../../cloudantHelper.js');
var IOTF = require('../../watsonIoT');
var connectedDevices = require('../../workbenchLib').connectedDevicesCache;

var debug = require('debug')('monitoring:cars');
debug.log = console.log.bind(console);

var devicesDB = cloudantHelper.db; // promise

/**
 * Get all the devices list in a region
 * 
 * GET /monitoring/cars/query?max_lat=[float]&max_lng=[float]&min_lat=[]&min_lng=[][&countby=status]
 * Result: 200 OK
 * { devices: [
 *   {"deviceID": "1234567890ab", 
 *    "lat": 12.345, 
 *    "lng": 34.567, 
 *    "status": "[status]",
 *    "t": 1234567890 },
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
 * When the [&countby=status] parameter is set,
 * Result: 200 OK
 * {
 *   "all": 20,
 *   "in_use": 10,
 *   "available": 5,
 *   "unavailable": 5
 * }
 * 
 * Examples:
 *  List all the cars
 *   http://localhost:6003/monitoring/cars/query?min_lat=-90&max_lat=90&min_lng=-180&max_lng=180
 */
router.get('/cars/query', function(req, res){
	var extent = normalizeExtent(req.query);
	// test the query values
	if ([extent.max_lat, extent.max_lng, extent.min_lat, extent.min_lng].some(function(v){ return isNaN(v); })){
		return res.status(400).send('One or more of the parameters are undefined or not a number'); // FIXME response code
	}
	
	// countby query sring
	var countby = req.query.countby;
	if (countby && countby !== 'status'){
		return res.status(400).send('Unsupported countby parameter is specified. Only "status" is allowed.');
	}
	
	//
	// query cars
	//
	getLatestCarStatus(extent).then(function(cars){
		// handle options first
		if (countby === 'status'){
			var msg = _.countBy(cars, _.property('status'));
			msg.all = cars.length;
			msg.in_use = msg.in_use || 0;
			msg.available = msg.available || 0;
			msg.unavailable = msg.unavailable || 0;
			debug('Returning countby status: ', msg);
			return res.send(msg);
		}
		
		// handle main stuffs
		var wssUrl = req.baseUrl + req.route.path;
		initWebSocketServer(req.app.server, wssUrl);
		// send normal response
		var ts = _.max(_.map(cars, function(d){ return d.lastEventTime || d.t || d.ts; })) || Date.now();
		res.send({ 
			count: cars.length, 
			devices: cars, 
			serverTime: ts,
			wssPath: wssUrl + '?' + "region=" + encodeURI(JSON.stringify(extent))
		});
	})['catch'](function(err){
		console.error(err);
		res.status(500).send(err);
	}).done();
});

var getLatestCarStatus = function(extent){
	
	// serach devices
	var searchDevices = Q(devicesDB).then(function(db){
		//
		// Get cars within a region using Cloudant geospatial query.
		// - The geo query index is created by the design doc. 
		//    See `carLocationGeoIndex` in the cloudantHelper.js
		// - This uses "bounding box query". 
		//    @see https://docs.cloudant.com/geo.html#querying-a-cloudant-geo-index
		// 
		// var bbox = [min_lng, min_lat, max_lng, max_lat].join();
		// var cloudantHelper.geo(db, 'designDocName', { bbox: bbox }).then...
		//
		// WORKAROUND: 
		// As of 1.1 development time, geo query feature in `npm cloudant` is under implementation. So, use query instead.
		//   @see https://github.com/cloudant/nodejs-cloudant/issues/101
		//
		
		// query car list from DB
		if(extent.whole_lng){
			var qs = ('lat:[' + extent.min_lat + ' TO ' + extent.max_lat + ']'); 
		}else if(extent.min_lng <= extent.max_lng){
			var qs = ('lat:[' + extent.min_lat + ' TO ' + extent.max_lat + '] AND ' +
					'lng:[' + extent.min_lng + ' TO ' + extent.max_lng + ']'); 
		}else{
			var qs = ('lat:[' + extent.min_lat + ' TO ' + extent.max_lat + '] AND ' +
					'(lng:[' + extent.min_lng + ' TO 180] OR lng:[-180 TO ' + extent.max_lng + '])'); 
		}
		return cloudantHelper.searchIndex(db, null, 'location', {q:qs})
			.then(function(result){
				return result.rows; // row.id, row.fields.lat, row.fields.lng 
			});
	});
	
	// get device IDs from searched devices
	var getDeviceIDs = function(rows){
		return (rows || []).map(function(row){ return row.id; });
	};
	
	// get reservations on the cars
	var getDeviceReservationInfoMap = function(deviceIDs){
		return cloudantHelper.searchView('activeReservations', {keys: deviceIDs})
			.then(function(result){
				var infoByDeviceId = {};
				(result.rows || []).forEach(function(r){ infoByDeviceId[r.key] = r.value; });
				return infoByDeviceId;
			});
	};
	
	// get car docs
	var getCarDocs = function(devices, reservationInfoMap){
		var cars = (devices || []).map(function(r){
			// create a car doc
			var car = {'lat': r.fields.lat, 'lng': r.fields.lng, info: {name: r.fields.name} };
			var res = reservationInfoMap[r.id];
			if(res){
				car.info.reservation = _.pick(res, 'pickupTime', 'dropOffTime', 'user', 'status');
			}
			var res_stat = (res && res.status) || 'no_active';
			return getCarDoc(r.id, car, res_stat);
		});
		return cars;
	};
	
	//
	// Combine all together
	//   (searchDevices, serarchDevices -> getDeviceIDs -> getDeviceReservationInfoMap) => getCarDocs
	//
	return Q.spread([searchDevices, Q(searchDevices).then(getDeviceIDs).then(getDeviceReservationInfoMap)], getCarDocs)
	.then(function(cars){
		return cars;
	});
};

/*
 * Get a car device document sent to Map console.
 * - This method has two mode: "only device" and "with db info"
 *   - When reservationStatus is empty, this methods works for "only device" mode.
 *     It is used for real-time tracking and returns only informations from the devicesCache.
 *     So, the mode is called to create WSS message
 *   - When reservationStatus is given, "with db info" is used.
 *     This mode is used to fulill the response of /cars/query.
 *     /cars/query first retrieves devie resavation status, and then call this method
 *     with the reservationStatus.
 */
var getCarDoc = function(deviceID, baseDoc, reservationStatus) {
	var result = baseDoc || {};
	result.deviceID = deviceID;
	var device = connectedDevices.getConnectedDevice(deviceID);
	// status
	var status = undefined;
	if (reservationStatus === 'driving') {
		status = 'in_use';
	} else if(reservationStatus === 'active'){
		status = 'unavailable';
	} else if (reservationStatus){
		status = 'available';
	}
	result.status = status;
	
	// location
	if(device){
		result.t = device.lastEventTime;
		result.lat = parseFloat(device.lat);
		result.lng = parseFloat(device.lng);
		result.speed = device.speed && parseFloat(device.speed);
		result.matched_heading = device.matched_heading && parseFloat(device.matched_heading);
		result.device_status = device.status;
		result.device_connection = true;
	} else {
		result.t = new Date().getTime();
		result.device_connection = false;
	}
	return result;
}

/*
 * Shared WebSocket server instance
 */
router.wsServer = null;

/*
 * Create WebSocket server
 */
var initWebSocketServer = function(server, path){
	if (router.wsServer !== null){
		return; // already created
	}
	
	//
	// Register event listener for sending update to clients
	// on every IoT Platform events
	//
	connectedDevices.on('event', function(event){
		if(!router.wsServer || !router.wsServer.clients)
			return;
		
		// prepare car docs for each
		var updated = (event.updated || []).map(function(device){
			return getCarDoc(device.deviceID, {}, null);
		});
		var touched = (event.touched || []);
		var deleted = (event.deleted || []).map(function(device){
			return getCarDoc(device.deviceID, {}, null);
		});
		
		//var allDevices = [].concat(updated).concat(touched).concat(deleted);
		//var ts = _.max(allDevices, function(d){ return d.lastEventTime; }) || Date.now();
		
		router.wsServer.clients.forEach(function(client){
			function filterByExtent(list){
				if(!client.extent)
					return list;
				
				var e = client.extent;
				return list.filter(function(d){
					if(!d.lat || !d.lng) return false; // not sure we can filter the device
					//
					if(d.lat < e.min_lat || e.max_lat < d.lat) return false; // out of range vertically
					if(d.min_lng < d.max_lng){
						if(d.lng < e.min_lng || e.max_lng < d.lng) return false;
						return true;
					}else{
						if(e.max_lng < d.lng && d.lng < e.min_lng) return false;
						return true;
					}
				});
			}
			var updatedForClient = filterByExtent(updated);
			var count = updatedForClient.length;
			if(count === 0)
				return; // not send message
			
			// construct message
			var msgs = JSON.stringify({
				count: (updatedForClient.length),
				devices: (updatedForClient),
				deleted: undefined,
			});
			try {
				client.send(msgs);
				debug('  sent WSS message. ' + msgs);
			} catch (e) {
				console.error('Failed to send wss message: ', e);
			}
		});
	});
	
	//
	// Implement a notification mechanism of the latest car reservation
	// status based on interval timer
	//
	var UPDATE_STATUS_TIMEOUT = 5000;
	var updateCarStatus = function(){
		if(!router.wsServer) return;
		// retrieve car statuses
		var clients = router.wsServer.clients;
		if(clients.length > 0)
			debug('Sending interval car status via wss...');
		Q.allSettled(clients.map(function(client){
			if(!client.extent) return Q(false);
			return getLatestCarStatus(client.extent).then(function(cars){
				if(!cars || cars.length == 0) return Q(false);
				var msg = {
						count: cars.length,
						devices: cars
				};
				var msgs = JSON.stringify(msg);
				client.send(msgs);
				debug('  sent interval car status via wss. # of cars: ', msg.count);
				return Q(true);
			});
		})).then(function(results){
			// check the result
			results.forEach(function(result){
				if(result.state !== 'fulfilled'){
					debug('Failed to send interval car status via wss: ', result.reason);
				}
			});
			// schedule next
			setTimeout(updateCarStatus, UPDATE_STATUS_TIMEOUT);
		}).done();
	};
	setTimeout(updateCarStatus, UPDATE_STATUS_TIMEOUT);
	
	//
	// Create WebSocket server
	//
	var wss = router.wsServer = new WebSocketServer({
		server: server,
		path: path,
		verifyClient : function (info, callback) { //only allow internal clients from the server origin
			var localhost = 'localhost';
			var isLocal = appEnv.url.toLowerCase().indexOf(localhost, appEnv.url.length - localhost.length) !== -1;
			var allow = isLocal || (info.origin.toLowerCase() === appEnv.url.toLowerCase());
			if(!allow){
				console.error("rejected web socket connection form external origin " + info.origin + " only connection form internal origin " + appEnv.url + " are accepted");
			}
			if(!callback){
				return allow;
			}
			var statusCode = (allow) ? 200 : 403;
			callback (allow, statusCode);
		}
	});
	
	//
	// Assign "extent" to the client for each connection
	//
	wss.on('connection', function(client){
		debug('got wss connectoin at: ' + client.upgradeReq.url);
		// assign extent obtained from the web sock request URL, to this client
		var url = client.upgradeReq.url;
		var qsIndex = url.lastIndexOf('?region=');
		if(qsIndex >= 0){
			try{
				var j = decodeURI(url.substr(qsIndex + 8)); // 8 is length of "?region="
				var extent = JSON.parse(j);
				client.extent = normalizeExtent(extent);
			}catch(e){
				console.error('Error on parsing extent in wss URL', e);
			}
		}
	});
}


function normalizeExtent(min_lat_or_extent, min_lng, max_lat, max_lng){
	// convert one when the object is passed 
	var min_lat;
	if(min_lat_or_extent && min_lat_or_extent.min_lat){
		var e = min_lat_or_extent;
		min_lat = e.min_lat;
		min_lng = e.min_lng;
		max_lat = e.max_lat;
		max_lng = e.max_lng;
	}else{
		min_lat = min_lat_or_extent;
	}
	
	// to float
	min_lat = parseFloat(min_lat);
	min_lng = parseFloat(min_lng);
	max_lat = parseFloat(max_lat);
	max_lng = parseFloat(max_lng);
	
	// normalize
	var whole_lng = ((max_lng - min_lng) > 360);
	min_lng = whole_lng ? -180 : ((min_lng + 180) % 360) - 180;
	max_lng = whole_lng ?  180 : ((max_lng + 180) % 360) - 180;
	var extent = {min_lng: min_lng, min_lat: min_lat, max_lng: max_lng, max_lat: max_lat, whole_lng: whole_lng};
	
	return extent;
}
