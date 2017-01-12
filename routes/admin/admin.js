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
 * Implements admin utilities, qr-code generator and messages monitor.
 */
var adminRouter = module.exports = require('express').Router();
var authenticate = require('./auth.js').authenticate;
var WebSocketServer = require('ws').Server;
var appEnv = require("cfenv").getAppEnv();

var IOTF = require('../../watsonIoT');
var connectedDevices = require('../../workbenchLib').connectedDevicesCache;
var driverInsightsAnalyze = require('../../driverInsights/analyze');
var driverInsightsTripRoutes = require('../../driverInsights/tripRoutes.js');
var monitoringDataSync = require('../monitoring/drivingDataSync.js');
var dbClient = require('../../cloudantHelper.js');

//
// Monitoring utilities
//
adminRouter.get('/connectedDevices', authenticate, function(req,res){
	res.send(connectedDevices.getConnectedDevices());
});

adminRouter.get('/iotConfig', authenticate, function(req,res){
	res.send(IOTF.devicesConfigs);
});

adminRouter.get('/allReservations', authenticate, function(req,res){
	_getReservations("allReservations", res);
});

adminRouter.get('/activeReservations', authenticate, function(req,res){
	_getReservations("activeReservations", res);
});

adminRouter.get('/closedReservations', authenticate, function(req,res){
	_getReservations("closedReservations", res);
});

function _getReservations(scope, res){
	dbClient.searchView(scope, {}).then(function(result){
		var reservations = result.rows.map(function(item){
			return item.value;
		}).filter(function(resv){
			return resv.status;
		});
		res.send(reservations);
	})["catch"](function(error){
		res.send(error);
	});
};

adminRouter.get('/driverInsights', authenticate, function(req, res) {
	driverInsightsAnalyze.getList().then(function(msg){
		res.send(msg);
	})["catch"](function(error){
		res.send(error);
	});
});

adminRouter.get('/driverInsights/behaviors', authenticate, function(req, res) {
	driverInsightsAnalyze.getTripList().then(function(msg){
		res.send(msg);
	})["catch"](function(error){
		res.send(error);
	});
});

adminRouter.get('/tripId', authenticate, function(req, res) {
	driverInsightsTripRoutes._searchTripsIndex({q:'*:*', sort:'-org_ts', limit:100})
	.then(function(result){
		res.send(result.rows.map(function(row){return row.fields;}));
	})['catch'](function(err){
		res.status(500).send(err);
	}).done();
});

adminRouter.get('/listpage', authenticate, function(req, res) {
	res.render("listpage", {});
});

/**
 * Start system monitoring data sync
 */
adminRouter.get('/monitoringDataSync', authenticate, function(req, res){
	var done = false;
	setTimeout(function(){
		if(!done){
			done = true;
			res.redirect('monitoringDataSyncStatus');
		}
	}, 1000);
	monitoringDataSync.initSync().then(function(resp){
		if(done) return;
		done = true;
		res.send(resp);
	})['catch'](function(e){
		if(done) return;
		done = true;
		res.status(e.code || 500).send(e);
	}).done();
});

adminRouter.get('/monitoringDataSyncStatus', authenticate, function(req, res){
	var msg = monitoringDataSync.getSyncStatus();
	res.send(msg);
});

/**
 * Start messages monitor wss server and show the Messages Monitor page
 */
adminRouter.get('/messagesMonitor', authenticate, function(req,res){
	if (!req.app.server) {
		console.error('adminRouter failed to create WebSocketServer due to missing app.server');
		res.status(500).send('Filed to start wss server in adminRouter.')
	} else {
		initWebSocketServer(req.app.server, req.originalUrl);
		res.render('messagesMonitor', { appName: appEnv.name, iotconfig: IOTF.devicesConfigs });
	}
});

//shared web socket server instance
adminRouter.prototype.wssServer = null;

//open wed socket server for messages monitoring on top of `server` at `path`.
var initWebSocketServer = function (server, path){
	if(adminRouter.prototype.wssServer !== null){
		return; //already created
	}
	//create websocket server
	adminRouter.prototype.wssServer = new WebSocketServer({
		server: server,
		path : path,
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

	//listen to messages monitor
	var messagesMonitor = require('../../workbenchLib').messagesMonitor;
	messagesMonitor.addListener(function(msg){
		adminRouter.prototype.wssServer.clients.forEach(function each(client) {
			try {
				client.send(JSON.stringify(msg));
			} catch (e) {
				console.error(e);
			}
		});
	});
};
