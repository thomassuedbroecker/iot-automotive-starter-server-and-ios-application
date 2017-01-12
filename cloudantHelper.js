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
 * This cloudantHelper provides two capabilities:
 * - A functions for operating with car-sharing application -- cloudantHelper
 * - A deferred version of cloudant client -- CloudantDeferred
 *    - You can get the client by `cloudantHelper.getDeferredClient(dbname, [designDoc], [indices])`
 */
var _ = require('underscore');
var Q = require("q");
var connectedDevicesCache = require('./workbenchLib').connectedDevicesCache;

var cloudantHelper = exports;
var cloudantCreds = VCAP_SERVICES.cloudantNoSQLDB[0].credentials;
var Cloudant = require('cloudant');

/*
 * Cloudant library initialization option
 */
var CLOUDANT_OPTS = {url: cloudantCreds.url, plugin: 'retry', retryAttempts: 5, retryTimeout: 500 };

/*
 * Settings for the device and reservation database
 */
var CLOUDANT_DB_NAME = 'mobilitystarterappdb';
var DB_UPDATE_INTERVAL = 6000; // period to update the DB from the memory image (mSec)

//
// ========= DEFERRED CLOUDANT CLIENT =========
//

/**
 * Create a deferred Cloudant client
 */
cloudantHelper.getDeferredDB = function(dbname, designDoc, indexes){
	var baseWrapper = new CloudantDeferred(dbname);
	return new CloudantDeferred(dbname, 
			baseWrapper.updateDesignDoc(designDoc)
			.then(function(){
				return baseWrapper.updateIndexes(indexes);
			}).then(function(){
				return baseWrapper.db; // resolved as the base db at last
			}));
};

function CloudantDeferred(dbname, db_promise){
	this.dbname = dbname;
	this.db = db_promise || this.ensureDB(dbname);
}

CloudantDeferred.prototype.ensureDB = function(dbName){
	//connect to the database or create it if needed
	var deferred = Q.defer();
	Cloudant(CLOUDANT_OPTS, function(err, cloudant){
		console.log('Connected to Cloudant');
		
		cloudant.db.list(function(err, all_dbs){
			if(err)
				return deferred.reject(err);
			if(all_dbs.indexOf(dbName) < 0){
				console.log('Missing Cloudant DB ' + dbName + '. Creating...');
				cloudant.db.create(dbName, function(err, body){
					if(err)
						return deferred.reject(err);
					console.log('  created ' + dbName + '.');
					return deferred.resolve(cloudant.use(dbName));
				});
			}else{
				console.log('Found existing DB ' + dbName + '.');
				return deferred.resolve(cloudant.use(dbName));
			}
		});
	});
	return deferred.promise;
}

CloudantDeferred.prototype.updateDesignDoc = function(designDoc){
	if(!designDoc) return Q();
	if(!designDoc._id) return Q.reject(new Error('Missing _id property in the design doc'));
	
	return this.db.then(function(db){
		var deferred = Q.defer();
		db.get(designDoc._id, null, function(err, body){
			if(!err){
				designDoc._rev = body._rev;
				db.insert(designDoc, null, function(err, body){
					if (err){
						console.error("!!!!!!!!error updating design doc: " + designDoc._id + " err = " + err + " body = " + body);
						deferred.reject(err);
					}else
						deferred.resolve(body);
				});
			}else if(err.error == 'not_found'){
				db.insert(designDoc, designDoc._id, function(err, body){
					if (err){
						console.error("!!!!!!!!error updating design doc: " + designDoc._id + " err = " + err + " body = " + body);
						deferred.reject(err);
					}else
						deferred.resolve(db);
				});
			}else{
				console.error('error on get design doc ' + err);
				deferred.resolve(err);
			}
		});
		return deferred.promise;
	});
};
	
CloudantDeferred.prototype.updateIndexes = function(indexes){
	if(!indexes || indexes.length == 0) return Q();
	
	var self = this;
	return this.db.then(function(db){
		var deferred = Q.defer();
		db.index(function(er, result){
			if(er) return deferred.reject(er);
			
			var existingIndexes = _.indexBy(result.indexes, 'name');
			var ops = indexes.filter(function(index){
				var existing = existingIndexes[index.name];
				return !_.isEqual(index, existing);
			}).map(function(index){
				var deferredIndex = Q.defer();
				console.log('  creating db index %s in DB %s...', index.name, self.dbname);
				db.index(index, function(er, result){
					if(er) return deferredIndex.reject(er);
					deferredIndex.resolve(true);
				})
				return deferredIndex.promise;
			});
			(ops.length == 0 ? Q() : Q.all(ops)).then(function(){
				deferred.resolve(db);
			}, function(er){
				deferred.reject(db);
			}).done();
		});
		return deferred.promise;
	});
};

CloudantDeferred.prototype.insert = function(doc, params){
	return Q(this.db).then(function(db){
		var deferred = Q.defer();
		db.insert(doc, params, function(er, result){
			if(er) return deferred.reject(er);
			deferred.resolve(result);
		});
		return deferred.promise;
	});
};

CloudantDeferred.prototype.destroy = function(docname, rev){
	return this.db.then(function(db){
		var deferred = Q.defer();
		db.destroy(docname, rev, function(er, result){
			if(er) return deferred.reject(er);
			deferred.resolve(result);
		});
		return deferred.promise;
	});
};

CloudantDeferred.prototype.get = function(docname, params){
	return this.db.then(function(db){
		var deferred = Q.defer();
		db.insert(docname, params, function(er, result){
			if(er) return deferred.reject(er);
			deferred.resolve(result);
		});
		return deferred.promise;
	});
};

CloudantDeferred.prototype.bulk = function(docs, params){
	return this.db.then(function(db){
		var deferred = Q.defer();
		db.bulk(docs, params, function(er, result){
			if(er) return deferred.reject(er);
			deferred.resolve(result);
		});
		return deferred.promise;
	});
};

CloudantDeferred.prototype.list = function(params){
	return this.db.then(function(db){
		var deferred = Q.defer();
		db.list(params, function(er, result){
			if(er) return deferred.reject(er);
			deferred.resolve(result);
		});
		return deferred.promise;
	});
};

CloudantDeferred.prototype.fetch = function(docnames, params){
	return this.db.then(function(db){
		var deferred = Q.defer();
		params = params || {}
		db.fetch(docnames, params, function(er, result){
			if(er) return deferred.reject(er);
			deferred.resolve(result);
		});
		return deferred.promise;
	});
};

/*
 * Cloudant Query
 */
CloudantDeferred.prototype.index = function(arg1){
	return this.db.then(function(db){
		var deferred = Q.defer();
		if(arg1){
			db.index(arg1, function(er, result){
				if(er) return deferred.reject(er);
				deferred.resolve(result);
			});
		}else{
			db.index(function(er, result){
				if(er) return deferred.reject(er);
				deferred.resolve(result);
			});
		}
		return deferred.promise;
	});
};

CloudantDeferred.prototype.find = function(params){
	return this.db.then(function(db){
		var deferred = Q.defer();
		db.find(params, function(er, result){
			if(er) return deferred.reject(er);
			deferred.resolve(result);
		});
		return deferred.promise;
	});
};

/*
 * Cloudant Search function
 * 
 * Result:
 * {
 *   rows: [
 *     {id: "_id", fields: ["field_value", ...], order: ['v1', ...]}, ...
 *   ],
 *   ranges?: {
 *     "faceted field name": {
 *       "facet name": "value", ...
 *     }, ...
 *   }
 * }
 */
CloudantDeferred.prototype.search = function(designname, searchname, params){
	designname = designname || this.dbname || null;
	return this.db.then(function(db){
		var deferred = Q.defer();
		db.search(designname, searchname, params, function(er, result){
			if(er) return deferred.reject(er);
			deferred.resolve(result);
		});
		return deferred.promise;
	});
};

/*
 * Cloudant View function
 * 
 * result: {
 *   rows: [
 *     {key: key, value: value},
 *     ..
 *   ]
 * }
 */
CloudantDeferred.prototype.view = function(designname, viewname, params){
	designname = designname || this.dbname || null;
	return Q(this.db).then(function(db){
		var deferred = Q.defer();
		db.view(designname, viewname, params, function(er, result){
			if(er) return deferred.reject(er);
			deferred.resolve(result);
		});
		return deferred.promise;
	});
}


//
//========= CAR-SHARING APPLICATION DB-RELATED IMPLEMENTATION =========
//

//init cloudant DB connection
var cloudant = Cloudant(CLOUDANT_OPTS);
var db = null;

cloudantHelper.getDBClient = function(){
	var deferred = Q.defer();
	Cloudant(CLOUDANT_OPTS, function(err,cloudant) {
		if(!err)
			deferred.resolve(cloudant.db.use(CLOUDANT_DB_NAME));
		else
			deferred.reject(err);
	});
	return deferred.promise;
};

//called periodically - scan devices and store data in DB
//a document per device
cloudantHelper.storeDeviceData = function(){
	var connectedDevices = connectedDevicesCache.getConnectedDevices();
	connectedDevices.forEach(function(device){
		cloudantHelper.createOrUpdateDevice(device);
	});
};

//update device in a DB document - if the device exists update data,
//if not, create a new document
cloudantHelper.createOrUpdateDevice = function(device){
	if (!device) return; // no device....
	var devID = device.deviceID;

	var updateTime = device.lastUpdateTime;
	if (updateTime > 0){
		var db = cloudant.db.use(CLOUDANT_DB_NAME);
		db.get(devID,null,function(err,body) {
			if (!err){
				if(!_.isEqual(body[updateTime], device)){
					body[updateTime] = device;
					db.insert(body,null,function(err, body){
						if (err){
							console.error("!!!!!!!!error inserting " + devID + " err = " + err + " body = " + body);
						}
					});
				}
			}else if (err.error == 'not_found'){
				var deviceDetails = cloudantHelper.onGettingNewDeviceDetails(device);
				if (deviceDetails){
					cloudantHelper.createDevice(device, deviceDetails);
				} else {
					console.error('unregistered device: ' + devID);
				}
			}else{
				console.error('error on get document ' + devID + " "+ err + ' body ' + body);
			}
		});
	}
};

//insert a device into a DB document
cloudantHelper.createDevice = function(device, deviceDetails){
	var deferred = Q.defer();
	var devID = device.deviceID;
	var updateTime = device.lastUpdateTime;
	console.log('A new device ' + devID + ' is detected. Creating a device document...');
	
	var doc = {};
	doc.deviceDetails = deviceDetails;
	if (updateTime > 0) doc[updateTime] = device;
	var db = cloudant.db.use(CLOUDANT_DB_NAME);
	db.insert(doc,devID,function(err, body) {
		if (err) {
			console.error("error inserting" + devID + " err = " + err + " body = " + body);
			return deferred.reject(err);
		}
		deferred.resolve(body);
	});
	return deferred.promise;
};

//user call back to get the device details for an unknown device 
//- when this return non-false object, the device will be registered
//- otherwise, the device won't be handled
//- this is overridden in _app.js for demo
cloudantHelper.onGettingNewDeviceDetails = function(device) { 
	return null;
};

// Get device additional info stored in the cloudant DB
cloudantHelper.getDeviceDetails = function(device){
	// handle array
	if (Array.isArray(device)){
		return Q.all(device.map(cloudantHelper.getDeviceDetails));
	}
	
	// handle single device
	if (!device) return Q(); // no device....
	var devID = device.deviceID;
	
	function cloneAndExtendDevice(body){
		var r = _.clone(device);
		_.extend(r, _.pick(body, function(value, key, object) {
								return !key.startsWith('_');
							}));
		return r;
	}
	
	var deferred = Q.defer();
	var db = cloudant.db.use(CLOUDANT_DB_NAME);
	db.find({selector:{_id:devID}, fields:["deviceDetails"]}, function(er, result) {
		if (er)
			return deferred.reject(er);
		if(!er && result.docs.length > 0 && !_.isEmpty(result.docs[0].deviceDetails)){
			// found a deviceDetails document
			deferred.resolve(cloneAndExtendDevice(result.docs[0].deviceDetails));
			return;
		}
		// FALLBACK
		// try to find a deviceDetails for the given device
		var deviceDetails = cloudantHelper.onGettingNewDeviceDetails(device);
		if (!deviceDetails){
			console.log('  can\'t get device details for ' + devID + '. skipping...');
			return deferred.reject();
		}
		// in case the device is missing, create the document
		if (result.docs.length == 0){
			cloudantHelper.createDevice(device, deviceDetails);
			return deferred.resolve(cloneAndExtendDevice(deviceDetails));
		}
		// add new device details to existing document
		console.log('Device details for ' + devID + ' is not in the device document. Migrating by adding it...');
		db.get(devID,null,function(err,body){
			if(!err){
				body.deviceDetails = deviceDetails;
				db.insert(body,null,function(err,body){
					if(err){
						console.error("!!!!!!!!error inserting" + devID + " err = " + err + " body = " + body);
						deferred.reject();
					}
					else
						deferred.resolve(cloneAndExtendDevice(deviceDetails));
				});
			}
			else{
				console.error('!!!!!!!device document ' + devID + 'is missing.');
				deferred.reject();
			}
		});
	});
	return deferred.promise;
};

//Get device additional info stored in the cloudant DB
cloudantHelper.getExistingDeviceDetails = function(device){
	// handle array
	if (device && Array.isArray(device)){
		return Q.all(device.map(cloudantHelper.getExistingDeviceDetails));
	}
	
	// handle single device

	var deferred = Q.defer();

	var devID = device ? device.deviceID : null;
	if (devID) {
		function cloneAndExtendDevice(body){
			var r = _.clone(device);
			_.extend(r, _.pick(body, function(value, key, object) { return !key.startsWith('_'); }));
			return r;
		}

		var db = cloudant.db.use(CLOUDANT_DB_NAME);
		db.get(devID, null, function(err, body) {
			if (err) {
				console.error("Error: " + err);
				return deferred.reject(err);
			}

			var deviceDetails = body.deviceDetails || {};
			deferred.resolve(cloneAndExtendDevice(deviceDetails));
		});
	} else {
		function cloneAndExtendDevice(body){
			var r = _.clone(device);
			_.extend(r, _.pick(body, function(value, key, object) { return !key.startsWith('_'); }));
			return r;
		}
		cloudantHelper.searchView('allDeviceDetials', {}).then(function(result) {
			var deviceDetailsList = result.rows.map(function(row) {
				var deviceDetails = _.clone(row.value);
				deviceDetails.deviceID = row.id;
				return deviceDetails;
			});
			deferred.resolve(deviceDetailsList);
		}, function(err) {
			console.error(err);
			deferred.reject(err);
		});
	}

	return deferred.promise;
};

//update device details in a DB document
cloudantHelper.updateDeviceDetails = function(device, deviceDetails){
	var deferred = Q.defer();

	if (!device) {
		console.error("invalid parameter: device is not specified.");
		return deferred.reject();
	}

	var devID = device.deviceID;
	var db = cloudant.db.use(CLOUDANT_DB_NAME);

	// get the current document for the device
	db.get(devID, null, function(err, body) {
		if (err) {
			if (err.statusCode === 404) {
				body = {_id: device.deviceID};
			} else {
				console.error("Error: " + err);
				return deferred.reject(err);
			}
		}
		
		// replace deviceDetails with given values and push it back to db
		body.deviceDetails = deviceDetails;
		db.insert(body, null, function(err, body) {
			if (err) {
				console.error("device cannot be updated: " + devID + " err = " + err + " body = " + body);
				return deferred.reject(err);
			}
			return deferred.resolve(body);
		});
	});
	return deferred.promise;
};

//update device details in a DB document
cloudantHelper.removeDeviceDetails = function(device){
	var deferred = Q.defer();

	if (!device) {
		console.error("invalid parameter: device is not specified.");
		return deferred.reject();
	}
	
	var db = cloudant.db.use(CLOUDANT_DB_NAME);
	db.get(device.deviceID, null, function(err, body) {
		if (err) {
			console.error(err);
			return deferred.reject(err);
		}
		
		db.destroy(body._id, body._rev, function(err, data) {
			if (err) {
				console.error(err);
				return deferred.reject(err);
			}
			return deferred.resolve(data);
		});
	});
	return deferred.promise;
}

//cleanup stale reservations
//- one still in 'active' whose dropOffTime is past
//- one still in 'driving' whose dropOffTime is more then 5 minutes before
cloudantHelper.cleanupStaleReservations = function(){
	return cloudantHelper.searchView('activeReservations', {})
	.then(function(result){
		var now = Math.floor(Date.now()/1000); // in seconds
		function isStale(res){
			var pickupTime = parseInt(res.pickupTime);
			var dropOffTime = parseInt(res.dropOffTime);
			return (res.status == 'active' && now > Math.max(pickupTime, dropOffTime)) || // passed reservation
					(res.status == 'driving' && now + 5*60 > Math.max(pickupTime, dropOffTime)); // passed reservation
		}
		var db = cloudant.db.use(CLOUDANT_DB_NAME);
		var cancelActions = _.pluck(result.rows, 'value')
			.filter(function(v){ return v.type == 'reservation';})
			.filter(isStale)
			.map(function(res){
				var deferred = Q.defer();
				console.log('Canceling stale reservation...: ' + JSON.stringify({
							status: res.status, 
							dropOffTime: new Date(parseInt(res.dropOffTime)*1000).toISOString(),
						}));
				res.status = 'canceled'; // update the reservation status to canceled
				db.insert(res,null,function(err, body){
					if (err)
						console.error("!!!!!!!!error canceling reservation " + res._id + " err = " + err + " body = " + body);
					deferred.resolve(); // resolve anyway. will be retried again on failure
				});
				return deferred.promise;
			});
		if(cancelActions.length > 0){
			return Q.all(cancelActions);
		}
		return Q(); // return resolved promise
	})['catch'](function(err){
		console.error('Got error on canceling stale reservations');
		console.error(err);
	});
}

//search Cloudant view async
cloudantHelper.searchView = function(viewName, opts){
	var deferred = Q.defer();
	var db = cloudant.db.use(CLOUDANT_DB_NAME);
	db.view(CLOUDANT_DB_NAME, viewName, opts, function(err, body){
		if(!err)
			deferred.resolve(body);
		else
			deferred.reject(err);
	});
	return deferred.promise;

}

//search Cloudant index async
cloudantHelper.searchIndex = function(db, ddocName, indexName, opts){
	var deferred = Q.defer();
	ddocName = ddocName || CLOUDANT_DB_NAME;
	db.search(ddocName, indexName, opts, function(err, result){
		if (!err)
			return deferred.resolve(result);
		else
			deferred.resolve(err);
	})
	return deferred.promise;
}

//create a new Cloudant connection and returns a deferred DB
cloudantHelper.getDB = function(dbName, designDoc, indices){
	return cloudantHelper.getDeferredDB(dbName, designDoc, indices).db;
}

//
// INTIIALIZE THE MAIN `mobilitystarterappdb`
//

var locationMap = function (doc) {
	var lastUpdate = doc[Object.keys(doc)[Object.keys(doc).length - 1]];
	if(lastUpdate && lastUpdate.deviceID){
		var key = [lastUpdate.lat, lastUpdate.lng];
		emit(key, lastUpdate);
	}
};

var carLocationQueryIndex = function(doc){
	var lastUpdate = doc[Object.keys(doc)[Object.keys(doc).length - 1]];
	if(lastUpdate && lastUpdate.deviceID){
		index('lat', parseFloat(lastUpdate.lat), {"store": true});
		index('lng', parseFloat(lastUpdate.lng), {"store": true});
		index('name', (doc.deviceDetails && doc.deviceDetails.name), {"store": true});
	}
};

var carLocationGeoIndex = function(doc) {
	var lastUpdate = doc[Object.keys(doc)[Object.keys(doc).length - 1]];
	if(lastUpdate && lastUpdate.deviceID){
		var geometry = {
				type: "Point",
				coordinates: [parseFloat(lastUpdate.lng), parseFloat(lastUpdate.lat)]
			};
		st_index(geometry);
	}
};

var allDeviceDetailsMap = function(doc) {
	if(doc.deviceDetails){
		emit("deviceDetails", doc.deviceDetails);
	}
};

var privateDevicesMap = function(doc) {
	if(doc.deviceDetails && doc.deviceDetails.ownerId){
		emit(doc._id, {deviceId: doc._id, ownerId: doc.deviceDetails.ownerId});
	}
};

var activeReservationMap = function(doc) {
	if(doc.type == "reservation" && (doc.status == "active" || doc.status == "driving")){
		emit(doc.carId, {user: doc.userId, status: doc.status, pickupTime: parseInt(doc.pickupTime), dropOffTime: parseInt(doc.dropOffTime)});
		emit(doc.userId, doc);
	}
};

var closedReservationMap = function(doc) {
	if(doc.type == "reservation" && doc.status == "closed"){
		emit(doc.carId, {user: doc.userId, status: doc.status});
		emit(doc.userId, doc);
	}
};

var allReservationMap = function(doc) {
	if(doc.type == "reservation"){
		emit(doc.carId, {user: doc.userId, status: doc.status});
		emit(doc.userId, doc);
	}
};

var designDoc = {
	_id: '_design/' + CLOUDANT_DB_NAME,
	views: {
		location: {
			map: locationMap.toString()
		},
		allDeviceDetials: {
			map: allDeviceDetailsMap.toString()
		},
		privateDevices: {
			map: privateDevicesMap.toString()
		},
		activeReservations: {
			map: activeReservationMap.toString()
		},
		closedReservations: {
			map: closedReservationMap.toString()
		},
		allReservations: {
			map: allReservationMap.toString()
		}
	},
	indexes: {
		location: {
			index: carLocationQueryIndex.toString()
		},
	},
	st_indexes: {
		geoindex: {
			index: carLocationGeoIndex.toString()
		}
	}
};

//init DB and start timer session
(function(){
	cloudantHelper.ddb = cloudantHelper.getDeferredDB(CLOUDANT_DB_NAME, designDoc);
	cloudantHelper.db = db = cloudantHelper.ddb.db;
	setInterval(cloudantHelper.storeDeviceData, DB_UPDATE_INTERVAL);
}());
