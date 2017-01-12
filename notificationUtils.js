/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the IBM License, a copy of which may be obtained at:
 *
 * http://www14.software.ibm.com/cgi-bin/weblap/lap.pl?li_formnum=L-DDIN-AEGGZJ&popup=y&title=IBM%20IoT%20for%20Automotive%20Sample%20Starter%20Apps%20%28Android-Mobile%20and%20Server-all%29
 *
 * You may not use this file except in compliance with the license.
 */
var Q = new require('q');
var request = require("request");
var debug = require('debug')('notificationUtils');
debug.log = console.log.bind(console);

var notificationUtils = {
		CATEGORY_OPEN_RESERVATION: "CATEGORY_OPEN_RESERVATION",
		CATEGORY_OK: "CATEGORY_OK",
	notificationConfig: function() {
		var userVcapSvc = JSON.parse(process.env.USER_PROVIDED_VCAP_SERVICES || '{}');
		var vcapSvc = VCAP_SERVICES.imfpush || userVcapSvc.imfpush;
		if (vcapSvc) {
			var imfCreds = vcapSvc[0].credentials;
			return {
				baseURL: imfCreds.url,
				appGuid: imfCreds.appGuid,
				appSecret: imfCreds.appSecret,
				clientSecret: imfCreds.clientSecret
			};
		}
		console.warn('Push Notification service is not bound.');
		return {};
	}(),
	getDevices: function(){
		var options = {
			url: this.notificationConfig.baseURL + "/devices?expand=false",
			rejectUnauthorized: false
		};
		return this._doRequest(options);
	},
	sendMessage: function(/*String*/ message, /*String(optional)*/ category, /*Object(optoinal)*/ payload, /*Array(optoinal)*/ deviceIds, /*Array(optional)*/ tagNames){
		var body = JSON.stringify({
			"message": {"alert": message},
			"settings": {"apns": {
//				"badge": badge,
				"payload": payload ? JSON.stringify(payload) : "",
				"category": category || ""
			}},
			"target": {
				"deviceIds": Array.isArray(deviceIds) ? deviceIds : [],
				"tagNames": Array.isArray(tagNames) ? tagNames : []
			}
		});
		var options = {
			url: this.notificationConfig.baseURL + "/messages",
			method: "POST",
			headers: {
				"Content-Type":"application/json",
				"Content-Length": Buffer.byteLength(body),
				"appSecret": this.notificationConfig.appSecret
			},
			body: body
		};
		debug("Remote Notification body: " + body);
		return this._doRequest(options);
	},
	_doRequest: function(options){
		var deferred = Q.defer();
		request(options, function(error, response, body){
			if(!error){
				if(response.statusCode == 200 || response.statusCode == 202){
					var data = JSON.parse(body);
					deferred.resolve(data);
				}else{
					console.error("Notification Failure: response status code= " + response.statusCode + "\n\trequest= " + JSON.stringify(options));
					deferred.reject(response);
				}
			}else{
				console.error("Notification Failure: error= " + JSON.stringify(error) + "\n\trequest= " + JSON.stringify(options));
				deferred.reject(error);
			}
		});
		return deferred.promise;
	}
};
module.exports = notificationUtils;